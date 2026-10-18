"""Tests for the detection WebSocket access control (standard library only, no GPU needed).

Run from the repository root:  python -m unittest discover -s tests/backend -v
"""
import hashlib
import hmac
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "Base test", "Sign-Language-Recognition"))
import ws_auth  # noqa: E402

SECRET = "test-secret-0123456789abcd"
NOW = 1_700_000_000


def make_ticket(secret=SECRET, expires=NOW + 60, nonce="0123456789abcdef"):
    payload = f"{expires}.{nonce}"
    return payload + "." + hmac.new(secret.encode(), payload.encode(), hashlib.sha256).hexdigest()


class VerifyTicket(unittest.TestCase):
    def test_accepts_a_fresh_ticket(self):
        self.assertTrue(ws_auth.verify_ticket(SECRET, make_ticket(), NOW))

    def test_accepts_a_ticket_made_by_the_website(self):
        # Produced by createDetectionTicket's formula in asl/src/server/detection-token.ts with fixed inputs
        # (secret above, expires 4102444800, nonce 0123456789abcdef); keeps the two implementations in step.
        site = "4102444800.0123456789abcdef.c8c990886435119af9121b3476213ad1393e44b37fc9ed00450c853433b366c7"
        self.assertTrue(ws_auth.verify_ticket(SECRET, site, NOW))

    def test_refuses_expired_tampered_and_malformed_tickets(self):
        self.assertFalse(ws_auth.verify_ticket(SECRET, make_ticket(expires=NOW - 1), NOW))
        self.assertFalse(ws_auth.verify_ticket("another-secret-0123456789", make_ticket(), NOW))
        good = make_ticket()
        self.assertFalse(ws_auth.verify_ticket(SECRET, good[:-1] + ("0" if good[-1] != "0" else "1"), NOW))
        later = good.replace(str(NOW + 60), str(NOW + 99999), 1)  # extending the expiry breaks the signature
        self.assertFalse(ws_auth.verify_ticket(SECRET, later, NOW))
        for bad in ["", "garbage", "1.2", "a.b.c", "1.2.3.4", None, make_ticket(nonce="zz")]:
            self.assertFalse(ws_auth.verify_ticket(SECRET, bad, NOW), repr(bad))

    def test_no_secret_means_no_ticket_is_valid(self):
        self.assertFalse(ws_auth.verify_ticket("", make_ticket(secret=""), NOW))


class Handshake(unittest.TestCase):
    def config(self, required):
        return ws_auth.AuthConfig(secret=SECRET, required=required, origins=ws_auth.parse_origins(None))

    def test_foreign_origins_are_refused_even_with_a_valid_ticket(self):
        ok, _ = ws_auth.check_handshake(self.config(False), "https://evil.example", make_ticket(), NOW)
        self.assertFalse(ok)

    def test_our_origins_are_accepted(self):
        for origin in ("https://asl.dawnbalaschak.com", "http://localhost:4000", "https://asl.dawnbalaschak.com/"):
            ok, why = ws_auth.check_handshake(self.config(False), origin, None, NOW)
            self.assertTrue(ok, f"{origin}: {why}")

    def test_a_bad_ticket_is_refused_in_both_modes(self):
        for required in (False, True):
            ok, _ = ws_auth.check_handshake(self.config(required), "https://asl.dawnbalaschak.com", "bad.ticket.here", NOW)
            self.assertFalse(ok)

    def test_a_missing_ticket_depends_on_the_mode(self):
        self.assertTrue(ws_auth.check_handshake(self.config(False), None, None, NOW)[0])
        self.assertFalse(ws_auth.check_handshake(self.config(True), None, None, NOW)[0])
        self.assertFalse(ws_auth.check_handshake(self.config(True), "https://asl.dawnbalaschak.com", None, NOW)[0])

    def test_a_valid_ticket_passes_when_required(self):
        self.assertTrue(ws_auth.check_handshake(self.config(True), "https://asl.dawnbalaschak.com", make_ticket(), NOW)[0])

    def test_origins_can_be_configured(self):
        cfg = ws_auth.AuthConfig(origins=ws_auth.parse_origins("https://a.example, https://b.example/"))
        self.assertTrue(ws_auth.check_handshake(cfg, "https://b.example", None)[0])
        self.assertFalse(ws_auth.check_handshake(cfg, "https://asl.dawnbalaschak.com", None)[0])


class Addresses(unittest.TestCase):
    def test_prefers_cloudflare_then_forwarded_for(self):
        self.assertEqual(ws_auth.client_address({"cf-connecting-ip": "1.1.1.1", "x-forwarded-for": "2.2.2.2"}), "1.1.1.1")
        self.assertEqual(ws_auth.client_address({"x-forwarded-for": "2.2.2.2, 3.3.3.3"}), "2.2.2.2")
        self.assertEqual(ws_auth.client_address({}, "9.9.9.9"), "9.9.9.9")

    def test_connection_limiter_caps_per_address_and_frees_slots(self):
        lim = ws_auth.ConnectionLimiter(2)
        self.assertTrue(lim.acquire("a") and lim.acquire("a"))
        self.assertFalse(lim.acquire("a"))
        self.assertTrue(lim.acquire("b"))
        lim.release("a")
        self.assertTrue(lim.acquire("a"))
        lim.release("zzz")  # releasing an unknown address is harmless


if __name__ == "__main__":
    unittest.main()

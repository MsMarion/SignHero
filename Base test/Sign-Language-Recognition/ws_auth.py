"""Access control for the detection WebSocket (used by api_server_http.py).

Browsers get a short-lived ticket from the website (asl/src/server/detection-token.ts) and present it as
?token=... when they connect. The ticket is `<expires unix seconds>.<nonce>.<hex HMAC-SHA256 of "<expires>.<nonce>">`
signed with the secret shared in DETECTION_TOKEN_SECRET. Only the standard library is used so this can be
unit-tested without torch or mediapipe.
"""
import hashlib
import hmac
import re
import time
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Mapping, Optional

DEFAULT_ORIGINS = (
    "https://asl.dawnbalaschak.com",
    "http://localhost:4000",
    "http://127.0.0.1:4000",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
)

_HEX16 = re.compile(r"^[0-9a-f]{16}$")
_HEX64 = re.compile(r"^[0-9a-f]{64}$")
_DIGITS = re.compile(r"^\d{1,12}$")


def verify_ticket(secret: str, ticket: Optional[str], now: Optional[float] = None) -> bool:
    if not secret or not ticket:
        return False
    parts = ticket.split(".")
    if len(parts) != 3:
        return False
    expires, nonce, signature = parts
    if not (_DIGITS.match(expires) and _HEX16.match(nonce) and _HEX64.match(signature)):
        return False
    if int(expires) < (time.time() if now is None else now):
        return False
    expected = hmac.new(secret.encode(), f"{expires}.{nonce}".encode(), hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)


def parse_origins(value: Optional[str]) -> frozenset:
    if value is None:
        return frozenset(DEFAULT_ORIGINS)
    return frozenset(o.strip().rstrip("/") for o in value.split(",") if o.strip())


@dataclass(frozen=True)
class AuthConfig:
    secret: str = ""
    required: bool = False
    origins: frozenset = field(default_factory=lambda: frozenset(DEFAULT_ORIGINS))


def check_handshake(config: AuthConfig, origin: Optional[str], token: Optional[str], now: Optional[float] = None):
    """Returns (ok, reason). A browser's Origin must be one of ours; a ticket, when sent, must be valid; a ticket
    is mandatory once `required` is on. Non-browser clients (no Origin header) are only let in without a ticket
    while tickets are not required."""
    if origin is not None and origin.rstrip("/") not in config.origins:
        return False, "origin not allowed"
    if token is not None:
        if not verify_ticket(config.secret, token, now):
            return False, "invalid or expired ticket"
        return True, "ticket ok"
    if config.required:
        return False, "ticket required"
    return True, "no ticket (not required yet)"


def client_address(headers: Mapping[str, str], fallback: str = "unknown") -> str:
    """The real client address: Cloudflare's header when behind the tunnel, else the first X-Forwarded-For hop."""
    cf = headers.get("cf-connecting-ip")
    if cf and cf.strip():
        return cf.strip()
    fwd = headers.get("x-forwarded-for")
    if fwd and fwd.split(",")[0].strip():
        return fwd.split(",")[0].strip()
    return fallback


class ConnectionLimiter:
    """Caps simultaneous connections per client address."""

    def __init__(self, per_address: int):
        self.per_address = per_address
        self._counts = defaultdict(int)

    def acquire(self, address: str) -> bool:
        if self._counts[address] >= self.per_address:
            return False
        self._counts[address] += 1
        return True

    def release(self, address: str) -> None:
        if self._counts[address] > 0:
            self._counts[address] -= 1
        if self._counts[address] == 0:
            self._counts.pop(address, None)

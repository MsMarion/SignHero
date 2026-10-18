import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Short-lived tickets for the detection WebSocket. The browser fetches one from /api/detection-token just
 * before connecting; the detection server (api_server_http.py) checks the signature and expiry before it
 * accepts the socket, so only pages served by this site can use the GPU.
 *
 * Format: `<expires unix seconds>.<random nonce>.<hex HMAC-SHA256 of "<expires>.<nonce>">`.
 * api_server_http.py implements the same check; the two must stay in step.
 */
export const TICKET_TTL_SECONDS = 60;

function sign(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

export function createDetectionTicket(secret: string, nowMs: number = Date.now()): string {
  const payload = `${Math.floor(nowMs / 1000) + TICKET_TTL_SECONDS}.${randomBytes(8).toString("hex")}`;
  return `${payload}.${sign(secret, payload)}`;
}

export function verifyDetectionTicket(secret: string, ticket: string, nowMs: number = Date.now()): boolean {
  const parts = ticket.split(".");
  if (parts.length !== 3) return false;
  const [expires, nonce, signature] = parts as [string, string, string];
  if (!/^\d{1,12}$/.test(expires) || !/^[0-9a-f]{16}$/.test(nonce) || !/^[0-9a-f]{64}$/.test(signature)) return false;
  if (Number(expires) * 1000 < nowMs) return false;
  const expected = Buffer.from(sign(secret, `${expires}.${nonce}`), "hex");
  const given = Buffer.from(signature, "hex");
  return expected.length === given.length && timingSafeEqual(expected, given);
}

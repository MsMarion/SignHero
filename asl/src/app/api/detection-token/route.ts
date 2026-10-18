import { NextResponse } from "next/server";
import { env } from "~/env";
import { createDetectionTicket } from "~/server/detection-token";
import { createRateLimiter, getClientKey } from "~/server/rate-limit";

export const dynamic = "force-dynamic";

// A game reconnects a handful of times at most; this leaves room for a flaky connection but not for farming tickets.
const limiter = createRateLimiter({ limit: 60, windowMs: 60_000 });

/** GET: a short-lived ticket the detection server requires. `{ token: null }` when tickets are not configured. */
export function GET(request: Request) {
  const limited = limiter.check(getClientKey(request.headers));
  if (!limited.ok) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(Math.ceil(limited.retryAfterMs / 1000)) } },
    );
  }
  const secret = env.DETECTION_TOKEN_SECRET;
  return NextResponse.json(
    { token: secret ? createDetectionTicket(secret) : null },
    { headers: { "Cache-Control": "no-store" } },
  );
}

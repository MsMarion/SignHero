import { NextResponse } from "next/server";
import { createRateLimiter, getClientKey } from "~/server/rate-limit";
import { log } from "~/server/log";
import { parseClientError, sameOrigin } from "~/server/client-error";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 8 * 1024;
const limiter = createRateLimiter({ limit: 30, windowMs: 60_000 });

/**
 * POST /api/client-error: pages report uncaught errors, unhandled rejections and render crashes here
 * (see ClientErrorReporter and the error boundaries). They land in the server log as `client_error`
 * lines, so a broken page on someone's laptop is visible without asking them for a console screenshot.
 */
export async function POST(request: Request) {
  if (!sameOrigin(request.headers.get("origin"), request.headers.get("host"))) {
    return new NextResponse(null, { status: 403 });
  }
  const client = getClientKey(request.headers);
  if (!limiter.check(client).ok) return new NextResponse(null, { status: 429 });

  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) return new NextResponse(null, { status: 413 });
  const report = parseClientError(text);
  if (!report) return new NextResponse(null, { status: 400 });

  log.warn("client_error", { ...report, client, userAgent: request.headers.get("user-agent") ?? undefined });
  return new NextResponse(null, { status: 204 });
}

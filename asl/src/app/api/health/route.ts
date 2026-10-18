import { NextResponse } from "next/server";
import { db } from "~/server/db";
import { createRateLimiter, getClientKey } from "~/server/rate-limit";
import { detectionHealthUrl, summarize, withTimeout, type Check } from "~/server/health";
import { log } from "~/server/log";

export const dynamic = "force-dynamic";

const startedAt = Date.now();
const limiter = createRateLimiter({ limit: 30, windowMs: 60_000 });

/**
 * GET /api/health          liveness + database
 * GET /api/health?deep=1   also asks the detection (GPU) server whether it is up and on the GPU
 * 200 when everything checked is up, 503 otherwise; the body says which check failed.
 * Cheap enough for an uptime monitor every minute; rate limited because ?deep=1 calls another server.
 */
export async function GET(request: Request) {
  const limited = limiter.check(getClientKey(request.headers));
  if (!limited.ok) {
    return NextResponse.json({ status: "limited" }, { status: 429, headers: { "Retry-After": String(Math.ceil(limited.retryAfterMs / 1000)) } });
  }
  const deep = new URL(request.url).searchParams.get("deep") === "1";
  const checks: Record<string, Check> = {};

  const dbStart = Date.now();
  try {
    await withTimeout(db.$runCommandRaw({ ping: 1 }), 2500, "database ping");
    checks.database = { ok: true, ms: Date.now() - dbStart };
  } catch (error) {
    checks.database = { ok: false, ms: Date.now() - dbStart, error: String((error as Error).message ?? error) };
  }

  if (deep) {
    const url = detectionHealthUrl(process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:4001/ws/predict");
    const t0 = Date.now();
    try {
      if (!url) throw new Error("no detection server URL configured");
      const res = await withTimeout(fetch(url, { cache: "no-store" }), 3500, "detection server");
      if (!res.ok) throw new Error(`detection server answered ${res.status}`);
      const body = (await res.json()) as { device?: string; queue_depth?: number };
      checks.detection = { ok: true, ms: Date.now() - t0, device: body.device, queueDepth: body.queue_depth };
    } catch (error) {
      checks.detection = { ok: false, ms: Date.now() - t0, error: String((error as Error).message ?? error) };
    }
  }

  const status = summarize(checks);
  if (status !== "ok") log.error("health check failed", { checks });
  return NextResponse.json(
    {
      status,
      version: process.env.NEXT_PUBLIC_BUILD_SHA ?? "unknown",
      uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
      checks,
    },
    { status: status === "ok" ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}

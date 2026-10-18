/**
 * Small in-memory fixed-window rate limiter. The frontend is a single Node process, so process memory is
 * enough; counters reset on restart, which is acceptable for abuse control (not for billing).
 * `now` is injectable so the timing can be tested.
 */
export type RateLimitResult = { ok: boolean; retryAfterMs: number };

export type RateLimiter = {
  check(key: string, now?: number): RateLimitResult;
};

const PRUNE_ABOVE = 5000;

export function createRateLimiter(opts: { limit: number; windowMs: number }): RateLimiter {
  const hits = new Map<string, { count: number; resetAt: number }>();

  return {
    check(key, now = Date.now()) {
      if (hits.size > PRUNE_ABOVE) {
        for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
      }
      const entry = hits.get(key);
      if (!entry || entry.resetAt <= now) {
        hits.set(key, { count: 1, resetAt: now + opts.windowMs });
        return { ok: true, retryAfterMs: 0 };
      }
      if (entry.count >= opts.limit) {
        return { ok: false, retryAfterMs: entry.resetAt - now };
      }
      entry.count += 1;
      return { ok: true, retryAfterMs: 0 };
    },
  };
}

/**
 * Best-effort client address. Cloudflare's tunnel sets cf-connecting-ip; behind other proxies the first
 * x-forwarded-for entry is used. The Next server is only reachable on the LAN besides the tunnel, so this is
 * abuse control, not authentication.
 */
export function getClientKey(headers: Pick<Headers, "get">): string {
  const cf = headers.get("cf-connecting-ip")?.trim();
  if (cf) return cf;
  const fwd = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (fwd) return fwd;
  return headers.get("x-real-ip")?.trim() || "unknown";
}

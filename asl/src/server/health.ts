/** Pure helpers for /api/health, kept separate so they can be unit-tested without a database. */
export type Check = { ok: boolean; ms: number; error?: string; [extra: string]: unknown };

export function summarize(checks: Record<string, Check>): "ok" | "down" {
  return Object.values(checks).every((c) => c.ok) ? "ok" : "down";
}

/** Rejects if `promise` takes longer than `ms`. */
export function withTimeout<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${what} timed out after ${ms} ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** The detection server's status URL, derived from the WebSocket URL the pages use (wss://host/ws/predict). */
export function detectionHealthUrl(wsUrl: string | undefined): string | null {
  if (!wsUrl) return null;
  try {
    const u = new URL(wsUrl);
    u.protocol = u.protocol === "wss:" ? "https:" : "http:";
    u.pathname = "/concurrency_status";
    u.search = "";
    return u.toString();
  } catch {
    return null;
  }
}

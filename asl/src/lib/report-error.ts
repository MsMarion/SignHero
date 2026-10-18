import { debugInc } from "~/lib/debug";

/** Sends a browser error to the server log (POST /api/client-error). Deduplicated and capped per page view. */
const seen = new Set<string>();
const MAX_REPORTS = 10;

export function reportClientError(
  kind: "error" | "unhandledrejection" | "render" | "console",
  error: unknown,
): void {
  if (typeof window === "undefined" || seen.size >= MAX_REPORTS) return;
  const err = error as { message?: unknown; stack?: unknown } | string | null | undefined;
  const message = typeof err === "string" ? err : String(err?.message ?? err ?? "unknown error");
  const stack = typeof err === "object" && err && typeof err.stack === "string" ? err.stack : undefined;
  const key = `${kind}:${message}`;
  if (seen.has(key)) return;
  seen.add(key);
  debugInc("clientErrors");

  const body = JSON.stringify({
    kind,
    message,
    stack,
    url: window.location.pathname + window.location.search,
    build: process.env.NEXT_PUBLIC_BUILD_SHA,
  });
  try {
    if (!navigator.sendBeacon?.("/api/client-error", new Blob([body], { type: "application/json" }))) {
      void fetch("/api/client-error", { method: "POST", body, keepalive: true, headers: { "content-type": "application/json" } });
    }
  } catch {
    /* reporting must never throw */
  }
}

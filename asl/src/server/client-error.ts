/** Validation for browser error reports (POST /api/client-error). Pure, so it can be unit-tested. */
export type ClientErrorReport = {
  kind: "error" | "unhandledrejection" | "render" | "console";
  message: string;
  stack?: string;
  url?: string;
  build?: string;
};

const KINDS = new Set(["error", "unhandledrejection", "render", "console"]);

const cut = (v: unknown, max: number): string | undefined =>
  typeof v === "string" && v.length > 0 ? v.slice(0, max) : undefined;

/** Returns the cleaned report, or null if the body is not a usable report. */
export function parseClientError(text: string): ClientErrorReport | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const message = cut(r.message, 500);
  if (!message) return null;
  const kind = typeof r.kind === "string" && KINDS.has(r.kind) ? (r.kind as ClientErrorReport["kind"]) : "error";
  return { kind, message, stack: cut(r.stack, 2000), url: cut(r.url, 300), build: cut(r.build, 40) };
}

/** Browsers always send Origin on a cross-site POST; when present it must be this site. */
export function sameOrigin(origin: string | null, host: string | null): boolean {
  if (!origin) return true; // same-origin sendBeacon/fetch from older browsers; the rate limit still applies
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

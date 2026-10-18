/**
 * Structured server logging: one JSON object per line on stdout/stderr, so `journalctl -u signhero-frontend`
 * output can be filtered with jq and a log shipper could pick it up later without changes.
 *
 * LOG_LEVEL=debug|info|warn|error (default: debug in development, info in production).
 */
export type LogLevel = "debug" | "info" | "warn" | "error";

const ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export type LogSink = (line: string, level: LogLevel) => void;

const defaultSink: LogSink = (line, level) => {
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
};

export function parseLevel(value: string | undefined, fallback: LogLevel): LogLevel {
  return value && value in ORDER ? (value as LogLevel) : fallback;
}

/** Keeps the log line a sane size: long strings are cut, and errors become plain objects. */
export function sanitize(value: unknown, depth = 0): unknown {
  if (typeof value === "string") return value.length > 500 ? `${value.slice(0, 500)}…` : value;
  if (value instanceof Error) {
    return { name: value.name, message: sanitize(value.message), stack: sanitize(value.stack) };
  }
  if (depth > 3 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => sanitize(v, depth + 1));
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .slice(0, 30)
      .map(([k, v]) => [k, sanitize(v, depth + 1)]),
  );
}

export function createLogger(opts: { level: LogLevel; sink?: LogSink; now?: () => Date }) {
  const sink = opts.sink ?? defaultSink;
  const now = opts.now ?? (() => new Date());
  const emit = (level: LogLevel, msg: string, fields?: Record<string, unknown>) => {
    if (ORDER[level] < ORDER[opts.level]) return;
    const entry = { ts: now().toISOString(), level, msg, ...(sanitize(fields ?? {}) as Record<string, unknown>) };
    sink(JSON.stringify(entry), level);
  };
  return {
    debug: (msg: string, fields?: Record<string, unknown>) => emit("debug", msg, fields),
    info: (msg: string, fields?: Record<string, unknown>) => emit("info", msg, fields),
    warn: (msg: string, fields?: Record<string, unknown>) => emit("warn", msg, fields),
    error: (msg: string, fields?: Record<string, unknown>) => emit("error", msg, fields),
  };
}

export const log = createLogger({
  level: parseLevel(process.env.LOG_LEVEL, process.env.NODE_ENV === "production" ? "info" : "debug"),
});

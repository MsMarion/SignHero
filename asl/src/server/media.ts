/**
 * Song images and audio live in MinIO, which is not reachable from browsers any more (its ports are bound to
 * localhost). The site serves them itself at /api/media/<key>. These helpers are pure so they can be tested.
 */
export const MEDIA_PREFIX = "/api/media/";

/** Folders the media route will serve. Everything else in the bucket stays private. */
const ALLOWED_FOLDERS = ["audio", "thumbnails"];

/** The browser URL for an object key. */
export function mediaUrlForKey(key: string): string {
  return `${MEDIA_PREFIX}${key}`;
}

/**
 * Validates the path segments of /api/media/<...segments> and returns the object key, or null if it is not
 * something we serve (wrong folder, traversal, odd characters, too long).
 */
export function mediaKeyFromSegments(segments: string[]): string | null {
  if (segments.length < 2 || segments.length > 4) return null;
  if (!ALLOWED_FOLDERS.includes(segments[0]!)) return null;
  for (const s of segments) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,200}$/.test(s) || s.includes("..")) return null;
  }
  return segments.join("/");
}

/**
 * Turns whatever is stored for a song's image/audio into a URL a browser can load: relative paths and other
 * hosts pass through, a bare object key becomes /api/media/<key>, and old direct MinIO URLs
 * (http://host:4003/<bucket>/<key>) are rewritten so they keep working after the port is closed.
 */
export function resolveMediaUrl(
  value: string | null | undefined,
  opts: { bucket: string; minioPort?: string; fallback: (key: string) => string },
): string | null {
  if (!value) return null;
  if (value.startsWith("/")) return value;
  if (/^https?:\/\//i.test(value)) {
    const port = opts.minioPort ?? "4003";
    const m = new RegExp(`^https?://[^/]+:${port}/${opts.bucket}/(.+)$`, "i").exec(value);
    return m ? mediaUrlForKey(m[1]!) : value;
  }
  return opts.fallback(value);
}

import { GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { Readable } from "node:stream";
import { s3Client, BUCKET } from "~/lib/s3";
import { mediaKeyFromSegments } from "~/server/media";

/**
 * Serves song images and audio from MinIO, which is no longer reachable from browsers. Read-only (GET/HEAD),
 * only the audio/ and thumbnails/ folders, with Range support so audio can seek.
 */
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ key: string[] }> };

const CACHE = "public, max-age=86400";

function headersFrom(r: {
  ContentType?: string;
  ContentLength?: number;
  ContentRange?: string;
  ETag?: string;
  LastModified?: Date;
}) {
  const h = new Headers({ "Accept-Ranges": "bytes", "Cache-Control": CACHE, "X-Content-Type-Options": "nosniff" });
  if (r.ContentType) h.set("Content-Type", r.ContentType);
  if (r.ContentLength !== undefined) h.set("Content-Length", String(r.ContentLength));
  if (r.ContentRange) h.set("Content-Range", r.ContentRange);
  if (r.ETag) h.set("ETag", r.ETag);
  if (r.LastModified) h.set("Last-Modified", r.LastModified.toUTCString());
  return h;
}

async function resolveKey(ctx: Ctx): Promise<string | null> {
  const { key } = await ctx.params;
  return mediaKeyFromSegments(key.map(decodeURIComponent));
}

const notFound = () => new Response("Not found", { status: 404 });

export async function GET(request: Request, ctx: Ctx) {
  const key = await resolveKey(ctx);
  if (!key) return notFound();
  const range = request.headers.get("range");
  if (range && !/^bytes=\d*-\d*$/.test(range)) {
    return new Response("Bad range", { status: 416 });
  }
  try {
    const obj = await s3Client.send(new GetObjectCommand({ Bucket: BUCKET, Key: key, Range: range ?? undefined }));
    if (!obj.Body) return notFound();
    const body = Readable.toWeb(obj.Body as Readable) as ReadableStream;
    return new Response(body, { status: range ? 206 : 200, headers: headersFrom(obj) });
  } catch (error) {
    const name = (error as { name?: string }).name;
    if (name === "NoSuchKey" || name === "NotFound") return notFound();
    if (name === "InvalidRange") return new Response("Bad range", { status: 416 });
    console.error("Error serving media:", error);
    return new Response("Storage unavailable", { status: 502 });
  }
}

export async function HEAD(_request: Request, ctx: Ctx) {
  const key = await resolveKey(ctx);
  if (!key) return notFound();
  try {
    const obj = await s3Client.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
    return new Response(null, { status: 200, headers: headersFrom(obj) });
  } catch {
    return notFound();
  }
}

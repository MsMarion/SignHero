import { NextResponse } from "next/server";

/**
 * The song import tools (/devmode: YouTube import, transcription, uploads, song creation) cost money and
 * write to storage, and they have no admin check. They are off in production until songs are reworked;
 * set ENABLE_DEVMODE=1 to turn them on deliberately.
 */
export function devmodeEnabled(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.ENABLE_DEVMODE === "1";
}

/** Returns a 404 response when dev tools are off, otherwise null. Put at the top of each handler. */
export function devmodeGuard(): NextResponse | null {
  return devmodeEnabled() ? null : NextResponse.json({ error: "Not found" }, { status: 404 });
}

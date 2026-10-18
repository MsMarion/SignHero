import { NextResponse } from "next/server";
import { db } from "~/server/db";
import { devmodeGuard } from "~/server/devmode-guard";

export async function POST(request: Request) {
  const disabled = devmodeGuard();
  if (disabled) return disabled;

    try {
        const { albumName, songName, thumbnailName, interactions } =
            await request.json();

        const song = await db.song.create({
            data: {
                songName,
                albumName,
                thumbnailName,
                isCommunity: true,
                interactions: interactions ?? [],
            },
        });

        return NextResponse.json({ success: true, song }, { status: 201 });
    } catch (error) {
        console.error("Error saving song:", error);
        return NextResponse.json(
            { success: false, error: "Failed to save song" },
            { status: 500 }
        );
    }
}

export async function GET() {
  const disabled = devmodeGuard();
  if (disabled) return disabled;

    try {
        const songs = await db.song.findMany({
            orderBy: { createdAt: "desc" },
        });
        return NextResponse.json({ success: true, songs });
    } catch (error) {
        console.error("Error fetching songs:", error);
        return NextResponse.json(
            { success: false, error: "Failed to fetch songs" },
            { status: 500 }
        );
    }
}

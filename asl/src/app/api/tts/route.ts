import { NextResponse } from "next/server";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { env } from "~/env";

// Created on first use, not at import time: the client throws without an API key, which used to make
// `next build` fail wherever ELEVENLABS_API_KEY is not set (for example in CI).
let client: ElevenLabsClient | null = null;
function getClient(): ElevenLabsClient | null {
  if (!env.ELEVENLABS_API_KEY) return null;
  client ??= new ElevenLabsClient({ apiKey: env.ELEVENLABS_API_KEY });
  return client;
}

export async function POST(request: Request) {
  try {
    const tts = getClient();
    if (!tts) {
      return NextResponse.json({ error: "Text-to-speech is not configured" }, { status: 503 });
    }

    const { text } = await request.json();

    const voiceId = env.ELEVENLABS_VOICE_ID || "JBFqnCBsd6RMkjVDRZzb";
    const modelId = env.ELEVENLABS_MODEL_ID || "eleven_multilingual_v2";

    const audioStream = await tts.textToSpeech.convert(
      voiceId,
      {
        text: text || "Hello, world!",
        modelId: modelId,
        outputFormat: "mp3_44100_128",
      }
    );

    // Collect chunks from the async iterator
    const chunks: Uint8Array[] = [];
    for await (const chunk of audioStream as any) {
      chunks.push(chunk);
    }

    // Combine chunks into a single buffer
    const audioBuffer = Buffer.concat(chunks);

    return new NextResponse(audioBuffer, {
      headers: {
        "Content-Type": "audio/mpeg",
      },
    });
  } catch (error) {
    console.error("TTS Error:", error);
    return NextResponse.json(
      { error: "Failed to generate audio" },
      { status: 500 }
    );
  }
}

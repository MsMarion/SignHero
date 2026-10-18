import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { downloadAudioBuffer } from "~/lib/youtube";
import { env } from "~/env";
import { devmodeGuard } from "~/server/devmode-guard";

const apiKey = env.GEMINI_API_KEY;
const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;

// Configure the model
const model = genAI ? genAI.getGenerativeModel({ 
    model: env.GEMINI_MODEL_ID || "gemini-2.5-flash",
    generationConfig: {
        responseMimeType: "application/json"
    }
}) : null;

export async function POST(request: Request) {
  const disabled = devmodeGuard();
  if (disabled) return disabled;

    if (!genAI || !model) {
        return NextResponse.json(
            { success: false, error: "GEMINI_API_KEY is not configured" },
            { status: 500 }
        );
    }

    try {
        const formData = await request.formData();
        const file = formData.get("file") as File | null;
        const videoId = formData.get("videoId") as string | null;

        let audioBuffer: Buffer;

        // Request Body Size Limit: 25MB max for uploaded audio files
        const MAX_UPLOAD_SIZE = 25 * 1024 * 1024; // 25MB

        // 1. Get the audio buffer
        if (file) {
            if (file.size > MAX_UPLOAD_SIZE) {
                return NextResponse.json(
                    { success: false, error: `File too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Maximum is 25MB.` },
                    { status: 413 }
                );
            }
            const arrayBuffer = await file.arrayBuffer();
            audioBuffer = Buffer.from(arrayBuffer);
        } else if (videoId) {
            console.log("📍 Pulling audio from local MinIO for AI analysis:", videoId);
            // We know the file is already in MinIO thanks to the Bulletproof fetch
            // We'll try to find it with the standard extensions
            const { getFile } = await import("~/lib/s3");
            const possibleExtensions = ["webm", "m4a", "mp3"];
            let buffer: Buffer | null = null;
            
            for (const ext of possibleExtensions) {
                buffer = await getFile(`audio/${videoId}.${ext}`);
                if (buffer) {
                    console.log(`✅ Found local audio: audio/${videoId}.${ext}`);
                    break;
                }
            }

            if (!buffer) {
                // Fallback to the old method only if not found locally
                console.log("⚠️ Local audio not found, falling back to YouTube download...");
                audioBuffer = await downloadAudioBuffer(videoId);
            } else {
                audioBuffer = buffer;
            }
        } else {
            return NextResponse.json(
                { success: false, error: "No audio file or video ID provided" },
                { status: 400 }
            );
        }

        // 2. Transcribe with Gemini
        // Convert to base64
        const audioBase64 = audioBuffer.toString("base64");

        const prompt = `
            Analyze this audio file and select key words from the lyrics that are spaced approximately 2-4 seconds apart.
            Focus on strong, rhythmic nouns and verbs that would make for good ASL signs.
            Do NOT transcribe every single word.
            Ensure the selected words represent the main melody and flow of the song.
            
            Return a JSON array where each object has:
            - "word": The word spoken (string)
            - "start_time": The start time of the word in seconds (number)
            
            Strictly follow this JSON schema:
            [
              { "word": "Power", "start_time": 0.5 },
              { "word": "Dream", "start_time": 3.2 }
            ]
            
            Ensure coverage of the entire song duration.
        `;

        console.log("Sending to Gemini...");
        const result = await model.generateContent([
            prompt,
            {
                inlineData: {
                    mimeType: "audio/mp3",
                    data: audioBase64
                }
            }
        ]);

        const response = result.response;
        const text = response.text();
        
        console.log("Gemini response length:", text.length);

        // 3. Parse and Format
        let transcription = JSON.parse(text);
        
        // Handle potential nested wrapper if the model adds one
        if (!Array.isArray(transcription) && transcription.words) {
            transcription = transcription.words;
        }

        const interactions = transcription.map((item: any) => ({
            key: item.word.trim().charAt(0),
            timeElapsed: item.start_time
        }));

        return NextResponse.json({
            success: true,
            interactions
        });

    } catch (error) {
        console.error("Transcription error:", error);
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        return NextResponse.json(
            { success: false, error: `Transcription failed: ${errorMessage}` },
            { status: 500 }
        );
    }
}

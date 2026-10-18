import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  /**
   * Specify your server-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars.
   */
  server: {
    DATABASE_URL: z.string().url(),
    STORAGE_MODE: z.enum(["local", "cloud"]).default("local"),
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    // DigitalOcean Spaces (S3-compatible)
    DO_SPACES_KEY: z.string().optional(),
    DO_SPACES_SECRET: z.string().optional(),
    DO_SPACES_ENDPOINT: z.string().optional(),
    DO_SPACES_BUCKET: z.string().optional(),
    DO_SPACES_REGION: z.string().default("nyc3"),

    // Local MinIO
    LOCAL_STORAGE_KEY: z.string().optional(),
    LOCAL_STORAGE_SECRET: z.string().optional(),
    LOCAL_STORAGE_ENDPOINT: z.string().optional(),
    LOCAL_STORAGE_BUCKET: z.string().optional(),
    
    // AI Services & Python Bridge
    GEMINI_API_KEY: z.string().optional(),
    GEMINI_MODEL_ID: z.string().optional().default("gemini-2.5-flash"),
    ELEVENLABS_API_KEY: z.string().optional(),
    ELEVENLABS_VOICE_ID: z.string().optional().default("JBFqnCBsd6RMkjVDRZzb"),
    ELEVENLABS_MODEL_ID: z.string().optional().default("eleven_multilingual_v2"),
    PYTHON_PATH: z.string().optional().default("python"),

    NEXTAUTH_SECRET:
      process.env.NODE_ENV === "production"
        ? z.string()
        : z.string().optional(),
    NEXTAUTH_URL: z.preprocess(
      (str) => process.env.VERCEL_URL ?? str,
      process.env.VERCEL_URL ? z.string() : z.string().url()
    ),

    // Google sign-in (optional): the "Continue with Google" button only appears when both are set.
    // OAuth client authorised origins and redirect URIs must match NEXTAUTH_URL, e.g.
    // http://localhost:4000/api/auth/callback/google
    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),
    // Shared with the detection server (DETECTION_TOKEN_SECRET there): signs the tickets browsers present.
    DETECTION_TOKEN_SECRET: z.string().min(16).optional(),
  },

  /**
   * Specify your client-side environment variables schema here.
   */
  client: {
    NEXT_PUBLIC_GOOGLE_API_KEY: z.string().optional(),
    NEXT_PUBLIC_API_URL: z.string().url().optional().default("http://localhost:4001"),
    NEXT_PUBLIC_WS_URL: z.string().url().optional().default("ws://localhost:4001/ws/predict"),
  },

  /**
   * You can't destruct `process.env` as a regular object in the Next.js edge runtimes
   */
  runtimeEnv: {
    DATABASE_URL: process.env.DATABASE_URL,
    STORAGE_MODE: process.env.STORAGE_MODE,
    NODE_ENV: process.env.NODE_ENV,
    DO_SPACES_KEY: process.env.DO_SPACES_KEY,
    DO_SPACES_SECRET: process.env.DO_SPACES_SECRET,
    DO_SPACES_ENDPOINT: process.env.DO_SPACES_ENDPOINT,
    DO_SPACES_BUCKET: process.env.DO_SPACES_BUCKET,
    DO_SPACES_REGION: process.env.DO_SPACES_REGION,
    LOCAL_STORAGE_KEY: process.env.LOCAL_STORAGE_KEY,
    LOCAL_STORAGE_SECRET: process.env.LOCAL_STORAGE_SECRET,
    LOCAL_STORAGE_ENDPOINT: process.env.LOCAL_STORAGE_ENDPOINT,
    LOCAL_STORAGE_BUCKET: process.env.LOCAL_STORAGE_BUCKET,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    GEMINI_MODEL_ID: process.env.GEMINI_MODEL_ID,
    ELEVENLABS_API_KEY: process.env.ELEVENLABS_API_KEY,
    ELEVENLABS_VOICE_ID: process.env.ELEVENLABS_VOICE_ID,
    ELEVENLABS_MODEL_ID: process.env.ELEVENLABS_MODEL_ID,
    PYTHON_PATH: process.env.PYTHON_PATH,
    NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
    NEXTAUTH_URL: process.env.NEXTAUTH_URL,
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
    DETECTION_TOKEN_SECRET: process.env.DETECTION_TOKEN_SECRET,
    NEXT_PUBLIC_GOOGLE_API_KEY: process.env.NEXT_PUBLIC_GOOGLE_API_KEY,
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
    NEXT_PUBLIC_WS_URL: process.env.NEXT_PUBLIC_WS_URL,
  },
  /**
   * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially
   * useful for Docker builds.
   */
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  /**
   * Makes it so that empty strings are treated as undefined. `SOME_VAR: z.string()` and
   * `SOME_VAR=''` will throw an error.
   */
  emptyStringAsUndefined: true,
});

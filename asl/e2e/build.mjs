// Builds the site the way production does (next build, NODE_ENV=production) but wired to the mock
// detection server and the throwaway database, into its own folder so it never disturbs `pnpm dev`.
// Usage: node e2e/build.mjs   (the "e2e" script runs this first)
import { spawnSync } from "node:child_process";

const env = {
  ...process.env,
  NODE_ENV: "production",
  NEXT_DIST_DIR: ".next-e2e",
  DATABASE_URL: process.env.E2E_DATABASE_URL ?? "mongodb://localhost:4002/signhero_e2e?directConnection=true",
  NEXTAUTH_URL: `http://localhost:${process.env.E2E_APP_PORT ?? 4010}`,
  NEXTAUTH_SECRET: "e2e-nextauth-secret",
  DETECTION_TOKEN_SECRET: "e2e-ticket-secret-0123456789abcdef",
  // Baked into the browser bundle at build time, so it must be set here, not only when serving.
  NEXT_PUBLIC_WS_URL: `ws://127.0.0.1:${process.env.E2E_MOCK_PORT ?? 4011}/ws/predict`,
  SKIP_ENV_VALIDATION: "1",
  // On CI the page sends simulated empty frames instead of running hand tracking in software rendering, which
  // starves a small runner (see useSignDetection.ts). Locally the real MediaPipe path runs.
  NEXT_PUBLIC_SIMULATED_FRAMES: process.env.CI ? "1" : "",
  GOOGLE_CLIENT_ID: "",
  GOOGLE_CLIENT_SECRET: "",
};

const run = (args) => {
  const r = spawnSync("pnpm", args, { stdio: "inherit", env, shell: process.platform === "win32" });
  if (r.status !== 0) process.exit(r.status ?? 1);
};

run(["exec", "prisma", "db", "push", "--skip-generate"]);
run(["build"]);
// Next rewrites tsconfig.json when the dist folder is not .next; put it back so the working tree stays clean.
spawnSync("git", ["checkout", "--", "tsconfig.json"], { stdio: "ignore" });

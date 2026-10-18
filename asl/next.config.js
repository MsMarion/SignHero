/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
import "./src/env.js";
import { execSync } from "node:child_process";

// The commit this build was made from, shown in /api/health and the debug panel (so "which version is live?"
// has an answer). CI and local builds run inside the git checkout; anything else falls back to "unknown".
function buildSha() {
  try {
    return execSync("git rev-parse --short=12 HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return "unknown";
  }
}

/** @type {import("next").NextConfig} */
const config = {
  env: { NEXT_PUBLIC_BUILD_SHA: process.env.NEXT_PUBLIC_BUILD_SHA ?? buildSha() },
  // The deploy builds each release into its own folder (NEXT_DIST_DIR=.next-<sha>) while the
  // previous release keeps serving, then switches by restarting with the new value. Next bakes the
  // folder name into the build, so the server must be started with the same NEXT_DIST_DIR.
  // Unset (local dev, CI), it is the usual .next.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  eslint: {
    ignoreDuringBuilds: true,
  },
  async headers() {
    return [
      {
        // MediaPipe runtime copied from node_modules (scripts/copy-mediapipe.mjs); a day of caching is plenty.
        source: "/mediapipe/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=86400" }],
      },
    ];
  },
};

export default config;

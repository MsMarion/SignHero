/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
import "./src/env.js";

/** @type {import("next").NextConfig} */
const config = {
  // The deploy builds each release into its own folder (NEXT_DIST_DIR=.next-<sha>) while the
  // previous release keeps serving, then switches by restarting with the new value. Next bakes the
  // folder name into the build, so the server must be started with the same NEXT_DIST_DIR.
  // Unset (local dev, CI), it is the usual .next.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default config;

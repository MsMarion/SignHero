import { defineConfig } from "@playwright/test";
import { APP_PORT, APP_URL, MOCK_PORT, MOCK_URL, TICKET_SECRET, appEnv } from "./e2e/support/env";

/**
 * Browser tests for every page and interaction (docs/e2e-matrix.md lists them).
 *
 *   pnpm e2e:build   once: builds the site like production, wired to the mock detection server
 *   pnpm e2e         runs the suite (needs a MongoDB replica set, see e2e/support/env.ts)
 *
 * It serves the production build on port 4010 and a mock detection server on 4011. One worker: the
 * mock server's state is shared, and each test resets it.
 */
export default defineConfig({
  testDir: "./e2e/tests",
  globalSetup: "./e2e/global-setup.ts",
  globalTimeout: 45 * 60_000,
  // Tests run one at a time (workers: 1: they share the mock detection server) but are listed as independent,
  // so CI can split them evenly across shards instead of by file.
  fullyParallel: true,
  workers: 1,
  // CI runners are slow (see SLOW in e2e/support/helpers.ts), so everything gets three times as long there.
  timeout: process.env.CI ? 180_000 : 60_000,
  expect: { timeout: process.env.CI ? 30_000 : 10_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [["list"], ["html", { open: "never", outputFolder: "e2e-report" }], ["junit", { outputFile: "e2e-results/junit.xml" }]]
    : [["list"]],
  outputDir: "e2e-results/artifacts",
  use: {
    baseURL: APP_URL,
    viewport: { width: 1920, height: 1080 },
    // Locally use the installed Chrome; CI installs Playwright's own Chromium.
    channel: process.env.E2E_CHANNEL ?? (process.env.CI ? undefined : "chrome"),
    permissions: ["camera"],
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: {
      args: [
        "--use-fake-device-for-media-stream",
        "--use-fake-ui-for-media-stream",
        "--use-angle=swiftshader",
        "--enable-unsafe-swiftshader",
        "--autoplay-policy=no-user-gesture-required",
      ],
    },
  },
  webServer: [
    {
      command: "node e2e/support/mock-backend.mjs",
      url: `${MOCK_URL}/healthz`,
      env: { MOCK_PORT: String(MOCK_PORT), DETECTION_TOKEN_SECRET: TICKET_SECRET },
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: `pnpm exec next start --port ${APP_PORT}`,
      url: `${APP_URL}/api/health`,
      env: appEnv(),
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});

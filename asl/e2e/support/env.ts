/** Ports and settings shared by the build script, the Playwright config and the tests. */
export const APP_PORT = Number(process.env.E2E_APP_PORT ?? 4010);
export const MOCK_PORT = Number(process.env.E2E_MOCK_PORT ?? 4011);
export const APP_URL = `http://localhost:${APP_PORT}`;
export const MOCK_URL = `http://127.0.0.1:${MOCK_PORT}`;
export const DIST_DIR = ".next-e2e";

/** A throwaway database so the suite never touches development data. Needs a MongoDB replica set. */
export const DATABASE_URL =
  process.env.E2E_DATABASE_URL ?? "mongodb://localhost:4002/signhero_e2e?directConnection=true";

/** Shared by the site (which signs tickets) and the mock detection server (which checks them). */
export const TICKET_SECRET = "e2e-ticket-secret-0123456789abcdef";

/** Environment for building and serving the site under test. */
export const appEnv = (): Record<string, string> => ({
  NODE_ENV: "production",
  NEXT_DIST_DIR: DIST_DIR,
  DATABASE_URL,
  NEXTAUTH_URL: APP_URL,
  NEXTAUTH_SECRET: "e2e-nextauth-secret",
  DETECTION_TOKEN_SECRET: TICKET_SECRET,
  NEXT_PUBLIC_WS_URL: `ws://127.0.0.1:${MOCK_PORT}/ws/predict`,
  SKIP_ENV_VALIDATION: "1",
  LOG_LEVEL: "warn",
  // Never inherit real sign-in credentials from a developer's asl/.env: the suite expects Google to be off.
  GOOGLE_CLIENT_ID: "",
  GOOGLE_CLIENT_SECRET: "",
});

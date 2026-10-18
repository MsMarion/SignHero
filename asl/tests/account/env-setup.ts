// Import this FIRST in every test file: it sets the environment that ~/server/db and ~/env read.
//
// These tests talk to a real MongoDB replica set (hero-name claims use transactions, which need one).
// Point DATABASE_URL at it, for example the local dev database or a throwaway one:
//   DATABASE_URL="mongodb://localhost:4002/signhero?directConnection=true" pnpm test:account
// Every test creates rows under a unique tag and deletes them again, so a shared dev database is safe,
// but CI uses a throwaway replica set (see .github/workflows/ci.yml).
process.env.SKIP_ENV_VALIDATION ??= "1";
process.env.NEXTAUTH_URL ??= "http://localhost:4000";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is not set. Point it at a MongoDB replica set, e.g. mongodb://localhost:4002/signhero?directConnection=true",
  );
}

/** A short unique tag so parallel runs and leftover rows never collide. */
export const runTag = `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

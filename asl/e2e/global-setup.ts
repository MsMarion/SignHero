import { spawnSync } from "node:child_process";

/**
 * Wipes the dedicated e2e database and plants known rows (e2e/seed.ts). It runs in a child process under tsx:
 * loading the Prisma client inside Playwright's own TypeScript loader hangs.
 */
export default function globalSetup() {
  const r = spawnSync("pnpm", ["exec", "tsx", "e2e/seed.ts"], { stdio: "inherit", shell: process.platform === "win32" });
  if (r.status !== 0) throw new Error("e2e database seeding failed");
}

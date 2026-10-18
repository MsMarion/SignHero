// Fails when tests/e2e-matrix.md and the Playwright specs disagree: every matrix row (G-01, W-04, ...) must have a
// test whose title mentions its ID, and every ID used in a spec must have a row. X-nn rows are the documented
// "not automated" list and are ignored. Needs no browser or database, so CI runs it on every pull request.
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const matrix = readFileSync(join(here, "..", "..", "tests", "e2e-matrix.md"), "utf8");
const specDir = join(here, "tests");

const idPattern = /\b([A-Z])-(\d{2})\b/g;
const rows = new Set([...matrix.matchAll(/^\|\s*([A-Z]-\d{2})\s*\|/gm)].map((m) => m[1]).filter((id) => !id.startsWith("X-")));

const used = new Set();
for (const file of readdirSync(specDir).filter((f) => f.endsWith(".spec.ts"))) {
  const text = readFileSync(join(specDir, file), "utf8");
  for (const m of text.matchAll(idPattern)) {
    // only IDs in test titles and the id arrays: skip things like "UTF-8" (no match: needs two digits) and "A-Y"
    if (/^[GHWLANPSDMOT]$/.test(m[1])) used.add(`${m[1]}-${m[2]}`);
  }
}

const noTest = [...rows].filter((id) => !used.has(id)).sort();
const noRow = [...used].filter((id) => !rows.has(id)).sort();

console.log(`matrix rows: ${rows.size}, ids used by tests: ${used.size}`);
if (noTest.length) console.error(`rows without a test: ${noTest.join(", ")}`);
if (noRow.length) console.error(`test ids without a row: ${noRow.join(", ")}`);
process.exit(noTest.length || noRow.length ? 1 : 0);

// Copies the MediaPipe Hands runtime (wasm, model, loader) out of node_modules into public/mediapipe/hands
// so the site serves it itself instead of loading it from a third-party CDN at play time.
// Runs before dev/build and after install. public/mediapipe is generated, not committed.
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const from = join(root, "node_modules", "@mediapipe", "hands");
const to = join(root, "public", "mediapipe", "hands");

if (!existsSync(from)) {
  console.error(`copy-mediapipe: ${from} not found. Run pnpm install first.`);
  process.exit(1);
}

// Everything the runtime can ask for; the package's typings/readme/package.json stay behind.
const wanted = (name) => /\.(js|wasm|data|tflite|binarypb)$/.test(name) && name !== "index.d.ts";

rmSync(to, { recursive: true, force: true });
mkdirSync(to, { recursive: true });
let count = 0;
let bytes = 0;
for (const name of readdirSync(from)) {
  const src = join(from, name);
  if (!statSync(src).isFile() || !wanted(name)) continue;
  copyFileSync(src, join(to, name));
  count += 1;
  bytes += statSync(src).size;
}
if (count < 8) {
  console.error(`copy-mediapipe: only ${count} files copied from ${from}; the package layout may have changed.`);
  process.exit(1);
}
console.log(`copy-mediapipe: ${count} files (${(bytes / 1048576).toFixed(1)} MB) -> public/mediapipe/hands`);

// Pre-bundle the parser-suggestion worker to a self-contained plain-JS file.
//
// The worker runs untrusted parser regex in its own thread (ReDoS isolation),
// so it must load at runtime WITHOUT Turbopack, tsx, or esbuild present — none
// of which exist in production. esbuild (a dev/build-time tool) inlines the pure
// engine here into worker-dist/suggest.cjs; at runtime Node loads that plain
// file directly by absolute path (see evaluate-in-worker.ts).
//
// Wired to `predev` / `prebuild` in package.json and regenerated from source
// every build, so it can't drift from the engine.
import { fileURLToPath } from "node:url";
import path from "node:path";
import { build } from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

await build({
  entryPoints: [path.join(root, "src/server/suggest/suggest.worker.ts")],
  outfile: path.join(root, "worker-dist/suggest.cjs"),
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node20",
});

console.log("built worker-dist/suggest.cjs");

import { parentPort, workerData } from "node:worker_threads";
// Relative (not @/) imports so esbuild bundles the engine without alias config.
import { detectScore, runConfig } from "../../parsers/engine/evaluate";
import { ParseError } from "../../parsers/engine/types";
import type { WorkerInput, WorkerMessage } from "./protocol";

/** Bundled to worker-dist/suggest.cjs (see scripts/build-suggest-worker.mjs) and
 * spawned per suggestion request. Runs UNTRUSTED published-parser regex against
 * one bill's text in its own thread, so a catastrophic-backtracking pattern can
 * only hang this worker — the main thread terminates it on its deadline.
 *
 * Candidates arrive verified/likely-good first; results stream back as each is
 * evaluated so a timeout still returns everything finished before it. */
const { text, candidates } = workerData as WorkerInput;

const post = (msg: WorkerMessage) => parentPort?.postMessage(msg);

for (const cand of candidates) {
  // Detection first: a null score means this parser doesn't claim the bill, so
  // it never appears as a suggestion.
  const score = detectScore(cand.config, text);
  if (score === null) continue;
  let result = null;
  let error: string | null = null;
  try {
    result = runConfig(cand.config, text);
  } catch (err) {
    error = err instanceof ParseError ? err.message : String(err);
  }
  post({ type: "match", data: { token: cand.token, score, result, error } });
}
post({ type: "done" });

import path from "node:path";
import { Worker } from "node:worker_threads";
import type { CandidateResult, SuggestCandidate, WorkerMessage } from "./protocol";

/** Plain-JS worker bundle, produced by scripts/build-suggest-worker.mjs at
 * build time and loaded by absolute path so no bundler ever rewrites it. */
const WORKER_PATH = path.join(process.cwd(), "worker-dist", "suggest.cjs");

/** Wall-clock ceiling for evaluating a whole candidate set. A single
 * catastrophic regex can't exceed this — the worker is terminated. */
const DEFAULT_BUDGET_MS = 750;

/** Evaluate untrusted parsers against a bill in a separate thread with a hard
 * deadline. Detection + extraction for a malicious parser runs arbitrary regex;
 * a ReDoS pattern can only stall THIS worker, never the request's event loop,
 * and is killed at the deadline. Returns the candidates that finished in time,
 * keyed by token — callers pass verified/likely-good ones first so a squatter's
 * slow regex can't starve legitimate suggestions. */
export function evaluateCandidates(
  text: string,
  candidates: SuggestCandidate[],
  budgetMs = DEFAULT_BUDGET_MS,
): Promise<Map<string, CandidateResult>> {
  return new Promise((resolve) => {
    const results = new Map<string, CandidateResult>();
    if (candidates.length === 0) return resolve(results);

    const worker = new Worker(WORKER_PATH, {
      workerData: { text, candidates },
    });

    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      void worker.terminate();
      resolve(results);
    };

    const timer = setTimeout(finish, budgetMs);
    worker.on("message", (msg: WorkerMessage) => {
      if (msg.type === "match") results.set(msg.data.token, msg.data);
      else finish(); // "done"
    });
    // A worker load/runtime failure shouldn't break the drawer — just yield what
    // completed (usually nothing) and let the UI fall back to the builder.
    worker.on("error", finish);
    worker.on("exit", finish);
  });
}

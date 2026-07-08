import type { ParsedResult, ParserConfig } from "@/parsers/engine/types";

/** One parser the user could adopt, handed to the worker to evaluate against a
 * bill. `token` (configId::versionId) maps a result back to its source. */
export type SuggestCandidate = {
  token: string;
  config: ParserConfig;
};

/** Sent to the worker on spawn (via workerData). */
export type WorkerInput = {
  text: string;
  candidates: SuggestCandidate[];
};

/** Outcome for a candidate whose detection matched the bill. `score` is the
 * detection specificity; `result` is the extraction (null when extraction
 * threw); `error` is the ParseError message. */
export type CandidateResult = {
  token: string;
  score: number;
  result: ParsedResult | null;
  error: string | null;
};

/** Worker → main thread. One `match` per candidate that detects the bill
 * (non-matches are silently dropped), then a single `done`. */
export type WorkerMessage =
  | { type: "match"; data: CandidateResult }
  | { type: "done" };

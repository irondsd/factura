import { count, desc, eq } from "drizzle-orm";
import type { Database } from "@/db";
import { parserAdoptions, parserConfigs, parserVersions } from "@/db/schema";
import type { Tier, TierMatch } from "@/lib/probar";
import { pickBestScored } from "@/parsers/engine/evaluate";
import type { ParsedResult, ParserConfig } from "@/parsers/engine/types";
import { evaluateCandidates } from "../suggest/evaluate-in-worker";
import type { CandidateResult, SuggestCandidate } from "../suggest/protocol";

// The /probar cascade: run a visitor's bill against one trust tier at a time,
// official first, stopping at the first tier that recognizes it.
//
// Two rules make this safe to expose publicly:
//
// 1. EVERY tier goes through the worker, including official. The usual argument
//    for running official parsers on the request thread is about the *pattern*
//    being vetted — but here the attacker controls the *text*, and a
//    recheck-approved regex is verified against typical bills, not against 200 KB
//    of adversarial input crafted to maximize backtracking. runConfig also splits
//    on `region.before` and loops every capture. One sandboxed path with a hard
//    deadline, no second code path to keep correct.
//
// 2. Nothing here writes a bill. A match is recorded on the submission row and
//    shown to the visitor; turning it into a bill happens at claim time, under
//    the claimer's own adopted parser set.

/** How many parsers each tier contributes, and how long the worker may spend on
 * them. Official and verified are small curated sets; community is unbounded and
 * would otherwise make results drift as the registry grows, so it's capped and
 * ordered by adoptions — the parsers most people already trust go first. */
const TIER_BUDGET: Record<Tier, { limit: number; budgetMs: number }> = {
  official: { limit: 50, budgetMs: 500 },
  verified: { limit: 50, budgetMs: 500 },
  community: { limit: 60, budgetMs: 750 },
};

export type TierCandidate = {
  configId: string;
  versionId: string;
  config: ParserConfig;
  adoptionCount: number;
};

export type TierRun = {
  tier: Tier;
  /** The winner, or null when nothing in this tier recognized the bill — or when
   * the top two tied. */
  best: TierMatch | null;
  /** Everything else that recognized it, best-first. Shown as "also matched". */
  alternatives: TierMatch[];
  /** Two parsers claimed the bill equally well. Not a match, but a different
   * story to tell the visitor than "nothing recognized it". */
  ambiguous: boolean;
  /** How many parsers were actually tried, for the stepper's copy. */
  evaluated: number;
};

/** Latest PUBLISHED version of every parser in a tier.
 *
 * Published snapshots, not the mutable `body` draft: a published version is what
 * `adoptOfficialDefaults` hands a new account and what `adoptPackage` pins, so
 * showing a visitor a draft would show them something claiming can't reproduce.
 *
 * Ordered best-first (most adopted) because `evaluateCandidates` shares one
 * wall-clock budget across the set — a squatter's slow regex early in the list
 * would otherwise starve legitimate parsers behind it. */
export async function loadTierCandidates(
  db: Database,
  tier: Tier,
  limit: number,
): Promise<TierCandidate[]> {
  const published = await db
    .selectDistinctOn([parserVersions.configId], {
      configId: parserVersions.configId,
      versionId: parserVersions.id,
      config: parserVersions.config,
    })
    .from(parserVersions)
    .innerJoin(parserConfigs, eq(parserConfigs.id, parserVersions.configId))
    // Read the tier column directly. Every other helper in the app collapses it
    // to `verified = tier === "official"`, which is exactly the distinction a
    // three-tier cascade exists to make.
    .where(eq(parserConfigs.tier, tier))
    .orderBy(parserVersions.configId, desc(parserVersions.version));

  const counts = await db
    .select({ configId: parserAdoptions.configId, n: count() })
    .from(parserAdoptions)
    .groupBy(parserAdoptions.configId);
  const byConfig = new Map(counts.map((c) => [c.configId, c.n]));

  return published
    .map((p) => ({
      configId: p.configId,
      versionId: p.versionId,
      config: p.config as ParserConfig,
      adoptionCount: byConfig.get(p.configId) ?? 0,
    }))
    .sort((a, b) => b.adoptionCount - a.adoptionCount)
    .slice(0, limit);
}

function toMatch(
  candidate: TierCandidate,
  tier: Tier,
  scored: { score: number; result: ParsedResult | null; error: string | null },
): TierMatch {
  const c = candidate.config;
  return {
    configId: candidate.configId,
    versionId: candidate.versionId,
    slug: c.slug,
    displayName: c.vendor.displayName,
    vendorSlug: c.vendor.slug,
    tier,
    score: scored.score,
    ok: scored.result !== null,
    result: scored.result,
    error: scored.error,
    customDefs: (c.custom ?? []).map((f) => ({
      name: f.name,
      unit: f.unit ?? null,
      type: f.type,
    })),
  };
}

/** Turn a tier's candidates plus the worker's verdicts into a TierRun. Pure, so
 * the part that actually decides which parser wins is unit-tested without a
 * database or a worker thread (see cascade.test.ts) — the same pure-helpers /
 * DB-helpers split registry.ts uses. */
export function rankTierRun(
  tier: Tier,
  candidates: TierCandidate[],
  evaluated: Map<string, CandidateResult>,
): TierRun {
  const empty: TierRun = {
    tier,
    best: null,
    alternatives: [],
    ambiguous: false,
    evaluated: candidates.length,
  };

  // Only candidates the worker reported back detected the bill; the rest either
  // didn't match or ran out of budget, and both mean "not a fit".
  const matches = candidates
    .map((candidate) => {
      const r = evaluated.get(candidate.configId);
      return r ? toMatch(candidate, tier, r) : null;
    })
    .filter((m): m is TierMatch => m !== null);

  if (matches.length === 0) return empty;

  // Same rule ingest uses: a tie between the top two means two parsers claim the
  // bill equally well, and guessing would file it under the wrong vendor.
  const winner = pickBestScored(
    matches.map((m) => ({ item: m, score: m.score })),
  );
  const ranked = [...matches].sort(
    (a, b) =>
      b.score - a.score ||
      Number(b.ok) - Number(a.ok) ||
      a.displayName.localeCompare(b.displayName),
  );

  return {
    tier,
    best: winner?.item ?? null,
    alternatives: ranked.filter((m) => m !== winner?.item),
    ambiguous: winner === null,
    evaluated: candidates.length,
  };
}

/** Evaluate one tier against a bill. `text` must already be normalized. */
export async function runTier(
  db: Database,
  tier: Tier,
  text: string,
): Promise<TierRun> {
  const { limit, budgetMs } = TIER_BUDGET[tier];
  const candidates = await loadTierCandidates(db, tier, limit);
  if (candidates.length === 0) return rankTierRun(tier, candidates, new Map());

  const payload: SuggestCandidate[] = candidates.map((c) => ({
    // configId is unique per candidate here (one version per config), so it's a
    // sufficient token to map results back.
    token: c.configId,
    config: c.config,
  }));
  return rankTierRun(
    tier,
    candidates,
    await evaluateCandidates(text, payload, budgetMs),
  );
}

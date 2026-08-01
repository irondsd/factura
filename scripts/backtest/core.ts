// The walk-forward scoring itself, with no database in it, so the harness that
// judges the model can itself be tested. `backtestForecast.ts` is the thin CLI
// that loads real bills and calls this.

import {
  blendWeight,
  type FxPoint,
  fxDrift,
  gapFactor,
  householdDrift,
  levelGrowth,
  medianOf,
  normalizeHistory,
  type Observation,
  ownDrift,
  pointEstimate,
  recentLevel,
} from "../../src/lib/forecast";
import { shiftMonth } from "../../src/lib/format";
import { monthsBetween } from "../../src/lib/insights";

export type Account = {
  accountId: string;
  propertyId: string;
  vendorSlug: string;
  label: string;
  history: Observation[];
};

export type Tier = "carry" | "baseline" | "yoy";

type Ctx = {
  history: Observation[];
  target: string;
  household: Observation[][];
  fx: FxPoint[];
};

// ── The rungs ────────────────────────────────────────────────────────────────
// Candidate models, scored side by side on identical inputs. Deliberately
// reimplemented from the model's exported primitives rather than by adding
// "disable this part" knobs to `forecast.ts`: the production path stays a
// single code path with nothing switchable in it, and the harness stays free to
// ask questions production has no reason to support.
//
// A rung only earns its place in production if it beats the ones below it.

/** Drift for a prediction: the household signal where there is one, else the
 * account's own. Same precedence production uses. */
const driftFor = (history: Observation[], household: Observation[][]) =>
  householdDrift(household) ?? ownDrift(history);

export const RUNGS: {
  key: string;
  /** Column header in the matrix tables. Keep short. */
  short: string;
  label: string;
  predict: (c: Ctx) => number | null;
}[] = [
  {
    key: "carry",
    short: "last",
    label: "last amount",
    predict: ({ history }) => normalizeHistory(history).at(-1)?.amount ?? null,
  },
  {
    key: "carry+gap",
    short: "last×dr",
    label: "last amount × drift^gap",
    predict: ({ history, target, household, fx }) => {
      const sorted = normalizeHistory(history);
      const last = sorted.at(-1);
      if (!last) return null;
      return (
        last.amount *
        gapFactor(
          monthsBetween(last.month, target),
          driftFor(sorted, household),
          fxDrift(fx, target),
        )
      );
    },
  },
  {
    key: "median",
    short: "med3",
    label: "median of last 3",
    predict: ({ history }) => recentLevel(history),
  },
  {
    key: "median+gap",
    short: "med3×dr",
    label: "median of last 3 × drift^gap",
    predict: ({ history, target, household, fx }) => {
      const sorted = normalizeHistory(history);
      const last = sorted.at(-1)?.month;
      const base = recentLevel(sorted);
      if (!last || base == null) return null;
      return (
        base *
        gapFactor(
          monthsBetween(last, target),
          driftFor(sorted, household),
          fxDrift(fx, target),
        )
      );
    },
  },
  {
    key: "detrended",
    short: "detrend",
    label: "de-trended median × drift^gap",
    predict: ({ history, target, household, fx }) => {
      const sorted = normalizeHistory(history);
      const anchor = sorted.at(-1);
      if (!anchor) return null;
      const drift = driftFor(sorted, household);

      // A plain median of a rising series sits roughly one month stale — it
      // lands on the middle observation, not the newest. Carrying each of the
      // last three forward to the anchor month at the measured drift removes
      // that bias while keeping the outlier resistance a median is there for.
      const d = drift ?? 1;
      const lifted = sorted
        .slice(-3)
        .map((o) => o.amount * d ** monthsBetween(o.month, anchor.month));
      const base = medianOf(lifted);
      if (base == null) return null;
      return (
        base *
        gapFactor(
          monthsBetween(anchor.month, target),
          drift,
          fxDrift(fx, target),
        )
      );
    },
  },
  {
    key: "full",
    short: "yoy",
    label: "full model (YoY blend, ±1 anchor)",
    predict: ({ history, target, household, fx }) =>
      pointEstimate(
        history,
        target,
        driftFor(history, household),
        fxDrift(fx, target),
      ).point,
  },
  {
    key: "yoy-exact",
    short: "yoyExact",
    label: "YoY blend, exact anchor only",
    predict: ({ history, target, household, fx }) => {
      const sorted = normalizeHistory(history);
      const anchorMonth = sorted.at(-1)?.month;
      const baseline = recentLevel(sorted);
      if (!anchorMonth || baseline == null) return null;
      const drift = driftFor(sorted, household);
      const b =
        baseline *
        gapFactor(
          monthsBetween(anchorMonth, target),
          drift,
          fxDrift(fx, target),
        );

      // Exactly target−12, with no ±1 tolerance. Production tolerates being a
      // month out so one missed upload doesn't drop the estimator — harmless on
      // a smooth series, but on gas at a May or September turning point the
      // neighbouring month is a different season entirely, and that is exactly
      // where the YoY term is supposed to be earning its place.
      const exact = sorted.find(
        (o) => o.month === shiftMonth(target, -12),
      )?.amount;
      const growth = levelGrowth(sorted);
      if (exact == null || growth == null) return b;

      const span = monthsBetween(sorted[0].month, anchorMonth) + 1;
      const w = blendWeight(span);
      return w * (exact * growth) + (1 - w) * b;
    },
  },
];

/** Which degradation tier a prediction was made at, so the per-tier medians can
 * be read straight into `band()`'s defaults. */
export function tierOf(history: Observation[]): Tier {
  const sorted = normalizeHistory(history);
  if (sorted.length < 3) return "carry";
  const span = monthsBetween(sorted[0].month, sorted.at(-1)!.month) + 1;
  return span > 12 ? "yoy" : "baseline";
}

// ── Stats ────────────────────────────────────────────────────────────────────

export function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return Number.NaN;
  const i = (sorted.length - 1) * q;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return lo === hi
    ? sorted[lo]
    : sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}

export class Bucket {
  apes: number[] = [];
  add(ape: number) {
    this.apes.push(ape);
  }
  get n() {
    return this.apes.length;
  }
  summary() {
    const s = [...this.apes].sort((a, b) => a - b);
    return { median: quantile(s, 0.5), p90: quantile(s, 0.9), n: s.length };
  }
}

/** rung key → bucket, for one slice of the data. */
export type ByRung = Map<string, Bucket>;

export type Report = {
  overall: ByRung;
  byTier: Map<Tier, ByRung>;
  byVendor: Map<string, ByRung>;
  perAccount: Map<string, ByRung>;
  cadenceMisses: number;
  /** Target months scored, not predictions summed across rungs. */
  scored: number;
  earliest: string;
  latest: string;
};

function slotIn<K>(m: Map<K, ByRung>, k: K): ByRung {
  const existing = m.get(k);
  if (existing) return existing;
  const fresh: ByRung = new Map(RUNGS.map((r) => [r.key, new Bucket()]));
  m.set(k, fresh);
  return fresh;
}

/** Walk every account forward one month at a time, predicting each month from
 * only the data that predates it, and score against what actually arrived.
 *
 * The leak-avoidance is the whole point of this function, so it is worth being
 * explicit about what a prediction is allowed to see: the account's own bills
 * strictly before the target month, sibling accounts in the same property
 * truncated the same way, and blue rates from before the target month began. */
export function backtest(
  accounts: Account[],
  fx: FxPoint[],
  opts: { from?: string } = {},
): Report {
  const byProperty = new Map<string, Account[]>();
  for (const a of accounts) {
    byProperty.set(a.propertyId, [...(byProperty.get(a.propertyId) ?? []), a]);
  }

  const report: Report = {
    overall: new Map(RUNGS.map((r) => [r.key, new Bucket()])),
    byTier: new Map(),
    byVendor: new Map(),
    perAccount: new Map(),
    cadenceMisses: 0,
    scored: 0,
    earliest: "9999-99",
    latest: "0000-00",
  };

  for (const acct of accounts) {
    const siblings = byProperty.get(acct.propertyId) ?? [acct];
    const history = normalizeHistory(acct.history);

    // Start at 1: a prediction needs at least one prior observation.
    for (let i = 1; i < history.length; i++) {
      const actual = history[i];
      if (opts.from && actual.month < opts.from) continue;
      if (actual.amount <= 0) continue;

      const known = history.slice(0, i);
      const household = siblings.map((s) =>
        normalizeHistory(s.history).filter((o) => o.month < actual.month),
      );
      const fxKnown = fx.filter((p) => p.date < `${actual.month}-01`);

      // A "not due" prediction is a classification error, not a magnitude one.
      // Averaging it into APE would swamp the number and hide both.
      if (!pointEstimate(known, actual.month, null, null).due) {
        report.cadenceMisses++;
        continue;
      }

      const ctx: Ctx = {
        history: known,
        target: actual.month,
        household,
        fx: fxKnown,
      };
      const tier = slotIn(report.byTier, tierOf(known));
      const vendor = slotIn(report.byVendor, acct.vendorSlug);
      const account = slotIn(report.perAccount, acct.label);

      for (const rung of RUNGS) {
        const p = rung.predict(ctx);
        if (p == null || p <= 0) continue;
        const ape = Math.abs(p - actual.amount) / actual.amount;
        report.overall.get(rung.key)!.add(ape);
        tier.get(rung.key)!.add(ape);
        vendor.get(rung.key)!.add(ape);
        account.get(rung.key)!.add(ape);
      }

      report.scored++;
      if (actual.month < report.earliest) report.earliest = actual.month;
      if (actual.month > report.latest) report.latest = actual.month;
    }
  }

  return report;
}

/** The rung with the lowest median APE in a slice, and by how much it beats the
 * plain carry-forward. This is what a per-account model-selection rule would
 * key on, so seeing it per vendor says whether such a rule is worth building. */
export function bestRung(
  byRung: ByRung,
  stat: Stat = "median",
): { key: string; median: number; vsCarry: number } | null {
  let best: { key: string; median: number } | null = null;
  for (const [key, bucket] of byRung) {
    if (bucket.n === 0) continue;
    const median = bucket.summary()[stat];
    if (!Number.isFinite(median)) continue;
    if (!best || median < best.median) best = { key, median };
  }
  if (!best) return null;
  const carry = byRung.get("carry")?.summary()[stat] ?? Number.NaN;
  return { ...best, vsCarry: carry - best.median };
}

// ── Rendering ────────────────────────────────────────────────────────────────

export const pct = (v: number) =>
  Number.isFinite(v) ? `${(v * 100).toFixed(1)}%` : "—";

/** Overall table: one row per rung, median and p90 side by side. */
export function rungTable(byRung: ByRung, labelWidth = 34): string {
  const head =
    "".padEnd(labelWidth) +
    "median APE".padStart(11) +
    "p90 APE".padStart(10) +
    "n".padStart(7);
  const body = RUNGS.filter((r) => (byRung.get(r.key)?.n ?? 0) > 0)
    .map((r) => {
      const { median, p90, n } = byRung.get(r.key)!.summary();
      return (
        r.label.padEnd(labelWidth) +
        pct(median).padStart(11) +
        pct(p90).padStart(10) +
        String(n).padStart(7)
      );
    })
    .join("\n");
  return `${head}\n${body}`;
}

export type Stat = "median" | "p90";

/** Matrix: rows are slices (vendors, tiers, accounts), columns are rungs, cells
 * are one statistic. The winning cell in each row is marked.
 *
 * `p90` matters as much as `median` here: a model can be typically excellent
 * and occasionally catastrophic, and on a number this prominent the tail is
 * what loses trust. Ranking by median alone would hide that. */
export function matrix(
  rows: { label: string; byRung: ByRung }[],
  labelWidth = 22,
  stat: Stat = "median",
): string {
  const col = 10;
  const head =
    "".padEnd(labelWidth) +
    RUNGS.map((r) => r.short.padStart(col)).join("") +
    "n".padStart(6) +
    "  best";
  const body = rows
    .map(({ label, byRung }) => {
      const best = bestRung(byRung, stat);
      const cells = RUNGS.map((r) => {
        const b = byRung.get(r.key)!;
        if (b.n === 0) return "—".padStart(col);
        const v = pct(b.summary()[stat]);
        return (r.key === best?.key ? `*${v}` : v).padStart(col);
      }).join("");
      const n = byRung.get("full")?.n ?? 0;
      return (
        label.padEnd(labelWidth) +
        cells +
        String(n).padStart(6) +
        `  ${best?.key ?? "—"}`
      );
    })
    .join("\n");
  return `${head}\n${body}`;
}

const TIER_LABEL: Record<Tier, string> = {
  carry: "1–2 bills",
  baseline: "3–12 months",
  yoy: "13+ months",
};

export function render(
  r: Report,
  opts: { verbose?: boolean; stat?: Stat } = {},
): string {
  const stat: Stat = opts.stat ?? "median";
  const out: string[] = [];
  out.push(
    `\nBacktest — ${r.perAccount.size} account(s), ${r.scored} prediction(s), ${r.earliest} → ${r.latest}\n`,
  );
  out.push(rungTable(r.overall));

  out.push(`\nBY TIER — ${stat} APE per rung\n`);
  out.push(
    matrix(
      (["carry", "baseline", "yoy"] as Tier[])
        .filter((t) => r.byTier.has(t))
        .map((t) => ({ label: TIER_LABEL[t], byRung: r.byTier.get(t)! })),
      22,
      stat,
    ),
  );

  out.push(`\nBY VENDOR — ${stat} APE per rung\n`);
  out.push(
    matrix(
      [...r.byVendor.entries()]
        .sort((a, b) => (a[0] < b[0] ? -1 : 1))
        .map(([v, byRung]) => ({ label: v, byRung })),
      22,
      stat,
    ),
  );

  if (opts.verbose) {
    out.push(`\nBY ACCOUNT — ${stat} APE per rung\n`);
    out.push(
      matrix(
        [...r.perAccount.entries()].map(([label, byRung]) => ({
          label,
          byRung,
        })),
        30,
        stat,
      ),
    );
  }

  if (r.cadenceMisses > 0) {
    out.push(
      `\nCadence misses: ${r.cadenceMisses} — the model called the month off-cycle` +
        ` but a bill arrived. Excluded from the medians above.`,
    );
  }
  return `${out.join("\n")}\n`;
}

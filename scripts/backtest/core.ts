// The walk-forward scoring itself, with no database in it, so the harness that
// judges the model can itself be tested. `backtestForecast.ts` is the thin CLI
// that loads real bills and calls this.

import {
  type FxPoint,
  fxDrift,
  gapFactor,
  householdDrift,
  normalizeHistory,
  type Observation,
  ownDrift,
  pointEstimate,
  recentLevel,
} from "../../src/lib/forecast";
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
// Deliberately reimplemented from the exported primitives rather than by adding
// "disable this part" knobs to the model. The production path stays a single
// code path with nothing switchable in it, and the harness stays free to ask
// questions the model has no reason to support.

export const RUNGS: {
  key: string;
  label: string;
  predict: (c: Ctx) => number | null;
}[] = [
  {
    key: "carry",
    label: "last amount",
    predict: ({ history }) => normalizeHistory(history).at(-1)?.amount ?? null,
  },
  {
    key: "median",
    label: "median of last 3",
    predict: ({ history }) => recentLevel(history),
  },
  {
    key: "median+gap",
    label: "median × drift^gap",
    predict: ({ history, target, household, fx }) => {
      const sorted = normalizeHistory(history);
      const last = sorted.at(-1)?.month;
      const base = recentLevel(sorted);
      if (!last || base == null) return null;
      const drift = householdDrift(household) ?? ownDrift(sorted);
      return (
        base *
        gapFactor(monthsBetween(last, target), drift, fxDrift(fx, target))
      );
    },
  },
  {
    key: "full",
    label: "full model (YoY blend)",
    predict: ({ history, target, household, fx }) =>
      pointEstimate(
        history,
        target,
        householdDrift(household) ?? ownDrift(history),
        fxDrift(fx, target),
      ).point,
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

export type Report = {
  overall: Map<string, Bucket>;
  byTier: Map<Tier, Bucket>;
  byVendor: Map<string, Bucket>;
  perAccount: Map<string, Bucket>;
  cadenceMisses: number;
  scored: number;
  earliest: string;
  latest: string;
};

const bucketIn = <K>(m: Map<K, Bucket>, k: K): Bucket => {
  const existing = m.get(k);
  if (existing) return existing;
  const fresh = new Bucket();
  m.set(k, fresh);
  return fresh;
};

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

      for (const rung of RUNGS) {
        const p = rung.predict(ctx);
        if (p == null || p <= 0) continue;
        const ape = Math.abs(p - actual.amount) / actual.amount;
        report.overall.get(rung.key)!.add(ape);

        if (rung.key !== "full") continue;
        bucketIn(report.byTier, tierOf(known)).add(ape);
        bucketIn(report.byVendor, acct.vendorSlug).add(ape);
        bucketIn(report.perAccount, acct.label).add(ape);
        report.scored++;
        if (actual.month < report.earliest) report.earliest = actual.month;
        if (actual.month > report.latest) report.latest = actual.month;
      }
    }
  }

  return report;
}

// ── Rendering ────────────────────────────────────────────────────────────────

export const pct = (v: number) =>
  Number.isFinite(v) ? `${(v * 100).toFixed(1)}%` : "—";

export function table(
  rows: { label: string; bucket: Bucket }[],
  labelWidth = 26,
): string {
  const head =
    "".padEnd(labelWidth) +
    "median APE".padStart(11) +
    "p90 APE".padStart(10) +
    "n".padStart(7);
  const body = rows
    .filter((r) => r.bucket.n > 0)
    .map(({ label, bucket }) => {
      const { median, p90, n } = bucket.summary();
      return (
        label.padEnd(labelWidth) +
        pct(median).padStart(11) +
        pct(p90).padStart(10) +
        String(n).padStart(7)
      );
    })
    .join("\n");
  return `${head}\n${body}`;
}

const TIER_LABEL: Record<Tier, string> = {
  carry: "1–2 bills (carry)",
  baseline: "3–12 months (baseline)",
  yoy: "13+ months (yoy)",
};

export function render(r: Report, opts: { verbose?: boolean } = {}): string {
  const out: string[] = [];
  out.push(
    `\nBacktest — ${r.perAccount.size} account(s), ${r.scored} prediction(s), ${r.earliest} → ${r.latest}\n`,
  );
  out.push(
    table(
      RUNGS.map((x) => ({ label: x.label, bucket: r.overall.get(x.key)! })),
    ),
  );

  out.push("\nBY TIER (full model) — these are the band defaults to set\n");
  out.push(
    table(
      (["carry", "baseline", "yoy"] as Tier[])
        .filter((t) => r.byTier.has(t))
        .map((t) => ({ label: TIER_LABEL[t], bucket: r.byTier.get(t)! })),
    ),
  );

  out.push("\nBY VENDOR (full model)\n");
  out.push(
    table(
      [...r.byVendor.entries()]
        .sort((a, b) => (a[0] < b[0] ? -1 : 1))
        .map(([v, bucket]) => ({ label: v, bucket })),
    ),
  );

  if (opts.verbose) {
    out.push("\nBY ACCOUNT (full model)\n");
    out.push(
      table(
        [...r.perAccount.entries()]
          .sort((a, b) => b[1].summary().median - a[1].summary().median)
          .map(([label, bucket]) => ({ label, bucket })),
        34,
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

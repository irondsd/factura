import { and, eq, isNotNull } from "drizzle-orm";
import { db as database, type Database } from "../src/db/index";
import { bills, fxRates, vendors } from "../src/db/schema";
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
} from "../src/lib/forecast";
import { monthsBetween } from "../src/lib/insights";

/** How accurate is the bill forecaster, really?
 *
 * Walks every account's real history forward one month at a time, predicts each
 * month from ONLY the data that predates it, and scores the prediction against
 * what the bill actually was. Nothing here reads the `forecasts` table — that
 * table records what we told a user and must never be revised, while this asks
 * how the *current* formula performs. Because `pointEstimate` is pure and takes
 * its target month as an argument, every past prediction is reproducible, which
 * is what makes this possible over history from before the feature shipped.
 *
 * It scores four rungs of increasing complexity. The point is not to admire the
 * bottom row: a rung only earns its place if it beats the one above it. If
 * "median × drift^gap" ties the full model on your data, the YoY blend is
 * costing complexity for nothing and should be reconsidered.
 *
 * The constants in src/lib/forecast.ts (blend ramp, the 0.6/0.4 drift split,
 * MIN/MAX_DRIFT, the default band widths) are starting values chosen by
 * argument, not measurement. This script is how they get replaced with measured
 * ones — and the per-tier medians below are what the band defaults should be
 * set to.
 *
 * Read-only. It never writes anything.
 *
 * Usage (the `--` matters: without it dotenv-cli eats the --flags):
 *   npx dotenv -e .env.local -- tsx scripts/backtestForecast.ts [flags]
 *
 * Flags:
 *   --vendor=<slug>   only score accounts of one vendor (e.g. --vendor=edesur)
 *   --from=<YYYY-MM>  ignore target months before this one
 *   --verbose         add a per-account breakdown
 */

type Args = { vendor?: string; from?: string; verbose: boolean };

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const flagValue = (k: string) =>
    argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
  const from = flagValue("from");
  if (from && !/^\d{4}-(0[1-9]|1[0-2])$/.test(from)) {
    console.error("--from must be a YYYY-MM month.");
    process.exit(1);
  }
  return {
    vendor: flagValue("vendor"),
    from,
    verbose: argv.includes("--verbose"),
  };
}

// ── The rungs ────────────────────────────────────────────────────────────────
// Deliberately reimplemented here from the exported primitives rather than by
// adding "disable this part" knobs to the model. The production path stays a
// single code path with nothing switchable in it, and the harness stays free to
// ask questions the model has no reason to support.

type Ctx = {
  history: Observation[];
  target: string;
  household: Observation[][];
  fx: FxPoint[];
};

const RUNGS: {
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
      const gap = monthsBetween(last, target);
      return base * gapFactor(gap, drift, fxDrift(fx, target));
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
function tierOf(history: Observation[]): "carry" | "baseline" | "yoy" {
  const sorted = normalizeHistory(history);
  if (sorted.length < 3) return "carry";
  const span = monthsBetween(sorted[0].month, sorted.at(-1)!.month) + 1;
  return span > 12 ? "yoy" : "baseline";
}

// ── Stats ────────────────────────────────────────────────────────────────────

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return Number.NaN;
  const i = (sorted.length - 1) * q;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return lo === hi
    ? sorted[lo]
    : sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}

class Bucket {
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

const pct = (v: number) =>
  Number.isFinite(v) ? `${(v * 100).toFixed(1)}%` : "—";

function table(
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

// ── Loading ──────────────────────────────────────────────────────────────────

type Account = {
  accountId: string;
  propertyId: string;
  vendorSlug: string;
  label: string;
  history: Observation[];
};

async function load(db: Database, args: Args) {
  const rows = await db
    .select({
      accountId: bills.accountId,
      propertyId: bills.propertyId,
      vendorSlug: vendors.slug,
      vendorName: vendors.displayName,
      period: bills.period,
      amount: bills.totalAmount,
    })
    .from(bills)
    .innerJoin(vendors, eq(bills.vendorId, vendors.id))
    .where(
      and(
        eq(bills.status, "parsed"),
        isNotNull(bills.period),
        isNotNull(bills.totalAmount),
        isNotNull(bills.accountId),
        isNotNull(bills.propertyId),
      ),
    );

  const byAccount = new Map<string, Account>();
  for (const r of rows) {
    if (args.vendor && r.vendorSlug !== args.vendor) continue;
    const id = r.accountId!;
    const acct = byAccount.get(id) ?? {
      accountId: id,
      propertyId: r.propertyId!,
      vendorSlug: r.vendorSlug,
      label: `${r.vendorName} · ${id.slice(0, 8)}`,
      history: [],
    };
    acct.history.push({
      month: r.period!.slice(0, 7),
      amount: Number(r.amount),
    });
    byAccount.set(id, acct);
  }

  for (const a of byAccount.values()) a.history = normalizeHistory(a.history);

  const fxRows = await db.query.fxRates.findMany({ orderBy: [fxRates.date] });
  const fx: FxPoint[] = fxRows.map((r) => ({
    date: r.date,
    rate: Number(r.venta),
  }));

  return { accounts: [...byAccount.values()], fx };
}

// ── The walk ─────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs();
  const { accounts, fx } = await load(database, args);

  if (accounts.length === 0) {
    console.error(
      "No parsed bills with both a period and an amount." +
        (args.vendor ? ` (--vendor=${args.vendor} matched nothing.)` : ""),
    );
    process.exit(1);
  }

  const byProperty = new Map<string, Account[]>();
  for (const a of accounts) {
    byProperty.set(a.propertyId, [...(byProperty.get(a.propertyId) ?? []), a]);
  }

  const overall = new Map(RUNGS.map((r) => [r.key, new Bucket()]));
  const byTier = new Map<string, Bucket>();
  const byVendor = new Map<string, Bucket>();
  const perAccount = new Map<string, Bucket>();
  let cadenceMisses = 0;
  let scored = 0;
  let earliest = "9999-99";
  let latest = "0000-00";

  for (const acct of accounts) {
    const siblings = byProperty.get(acct.propertyId) ?? [acct];

    // Start at 1: a prediction needs at least one prior observation.
    for (let i = 1; i < acct.history.length; i++) {
      const actual = acct.history[i];
      if (args.from && actual.month < args.from) continue;
      if (actual.amount <= 0) continue;

      const known = acct.history.slice(0, i);
      // Everything the model could legitimately have seen at prediction time:
      // sibling accounts truncated to the same cutoff, and blue rates from
      // before the target month began. Truncating the fx series here (rather
      // than relying on fxDrift's own window) is what keeps the last few days
      // of the target month out of a prediction about that month.
      const household = siblings.map((s) =>
        s.history.filter((o) => o.month < actual.month),
      );
      const fxKnown = fx.filter((p) => p.date < `${actual.month}-01`);

      const ctx: Ctx = {
        history: known,
        target: actual.month,
        household,
        fx: fxKnown,
      };

      // A "not due" prediction is a classification error, not a magnitude one.
      // Averaging it into APE would swamp the number and hide both.
      if (!pointEstimate(known, actual.month, null, null).due) {
        cadenceMisses++;
        continue;
      }

      for (const rung of RUNGS) {
        const p = rung.predict(ctx);
        if (p == null || p <= 0) continue;
        const ape = Math.abs(p - actual.amount) / actual.amount;
        overall.get(rung.key)!.add(ape);

        if (rung.key === "full") {
          const tier = tierOf(known);
          (byTier.get(tier) ?? byTier.set(tier, new Bucket()).get(tier)!).add(
            ape,
          );
          const v = acct.vendorSlug;
          (byVendor.get(v) ?? byVendor.set(v, new Bucket()).get(v)!).add(ape);
          const k = acct.label;
          (perAccount.get(k) ?? perAccount.set(k, new Bucket()).get(k)!).add(
            ape,
          );
          scored++;
          if (actual.month < earliest) earliest = actual.month;
          if (actual.month > latest) latest = actual.month;
        }
      }
    }
  }

  if (scored === 0) {
    console.error(
      "Nothing to score: every account has too little history, or --from excluded it all.",
    );
    process.exit(1);
  }

  console.log(
    `\nBacktest — ${accounts.length} account(s), ${scored} prediction(s), ${earliest} → ${latest}\n`,
  );
  console.log(
    table(RUNGS.map((r) => ({ label: r.label, bucket: overall.get(r.key)! }))),
  );

  const TIER_LABEL: Record<string, string> = {
    carry: "1–2 bills (carry)",
    baseline: "3–12 months (baseline)",
    yoy: "13+ months (yoy)",
  };
  console.log("\nBY TIER (full model) — these are the band defaults to set\n");
  console.log(
    table(
      ["carry", "baseline", "yoy"]
        .filter((t) => byTier.has(t))
        .map((t) => ({ label: TIER_LABEL[t], bucket: byTier.get(t)! })),
    ),
  );

  console.log("\nBY VENDOR (full model)\n");
  console.log(
    table(
      [...byVendor.entries()]
        .sort((a, b) => (a[0] < b[0] ? -1 : 1))
        .map(([v, bucket]) => ({ label: v, bucket })),
    ),
  );

  if (args.verbose) {
    console.log("\nBY ACCOUNT (full model)\n");
    console.log(
      table(
        [...perAccount.entries()]
          .sort((a, b) => b[1].summary().median - a[1].summary().median)
          .map(([label, bucket]) => ({ label, bucket })),
        34,
      ),
    );
  }

  if (cadenceMisses > 0) {
    console.log(
      `\nCadence misses: ${cadenceMisses} — the model called the month off-cycle` +
        ` but a bill arrived. Excluded from the medians above.`,
    );
  }
  console.log("");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

import { and, eq, isNotNull } from "drizzle-orm";
import { db as database, type Database } from "../src/db/index";
import { bills, fxRates, vendors } from "../src/db/schema";
import type { FxPoint } from "../src/lib/forecast";
import { normalizeHistory } from "../src/lib/forecast";
import { type Account, backtest, render } from "./backtest/core";

/** How accurate is the bill forecaster, really?
 *
 * Walks every account's real history forward one month at a time, predicts each
 * month from ONLY the data that predates it, and scores the prediction against
 * what the bill actually was. Nothing here reads the `forecasts` table — that
 * table records what we told a user and must never be revised, while this asks
 * how the *current* formula performs. Because `pointEstimate` is pure and takes
 * its target month as an argument, every past prediction is reproducible, which
 * is what makes this work over history from before the feature shipped.
 *
 * It scores four rungs of increasing complexity. The point is not to admire the
 * bottom row: a rung only earns its place if it beats the one above it. If
 * "median × drift^gap" ties the full model on your data, the YoY blend is
 * costing complexity for nothing and should be reconsidered.
 *
 * The constants in src/lib/forecast.ts (blend ramp, the 0.6/0.4 drift split,
 * MIN/MAX_DRIFT, the default band widths) are starting values chosen by
 * argument, not measurement. This script is how they get replaced with measured
 * ones — the per-tier medians are what `band()`'s defaults should be set to.
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
 *
 * The scoring itself lives in ./backtest/core.ts, which has no database in it
 * and is unit-tested — a harness that judges the model has to be trustworthy
 * itself.
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

  const report = backtest(accounts, fx, { from: args.from });

  if (report.scored === 0) {
    console.error(
      "Nothing to score: every account has too little history, or --from excluded it all.",
    );
    process.exit(1);
  }

  console.log(render(report, { verbose: args.verbose }));
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

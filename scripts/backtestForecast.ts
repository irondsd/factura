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
 * It scores several candidate models side by side on identical inputs. The
 * point is not to admire the bottom row: a rung only earns its place in
 * production if it beats the simpler ones. If plain `last amount` wins, that is
 * the answer, and the complexity above it should come out.
 *
 * Several constants in src/lib/forecast.ts have already been replaced this way
 * — OUTLIER_RATIO, the seasonal window, `band()`'s defaults — and the ones that
 * have not (the 0.6/0.4 drift split, MIN/MAX_DRIFT) are still starting values
 * chosen by argument. This script is how they get replaced with measured ones.
 *
 * Run it before and after any change to the model, and check both columns: the
 * median says how the typical forecast does, the p90 says how bad the visible
 * failures are, and a change that improves one while wrecking the other is
 * usually not the improvement it looks like.
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
 *   --p90             rank the matrices by p90 instead of median APE — a model
 *                     can be typically excellent and occasionally catastrophic,
 *                     and on a hero number the tail is what loses trust
 *
 * The scoring itself lives in ./backtest/core.ts, which has no database in it
 * and is unit-tested — a harness that judges the model has to be trustworthy
 * itself.
 */

type Args = {
  vendor?: string;
  from?: string;
  verbose: boolean;
  stat: "median" | "p90";
};

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
    stat: argv.includes("--p90") ? "p90" : "median",
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

  console.log(render(report, { verbose: args.verbose, stat: args.stat }));
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

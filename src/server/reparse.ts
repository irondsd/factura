import { and, eq, inArray, isNull, or } from "drizzle-orm";
import type { db as Db } from "@/db";
import { bills } from "@/db/schema";
import { runConfig, selectConfig } from "@/parsers/engine/evaluate";
import type { ParserConfig } from "@/parsers/engine/types";
import { normalize } from "@/parsers/normalize";
import { ensureVendor } from "./defaults";
import {
  fileBillIntoProperty,
  findAccountMatch,
  vendorMetaExtra,
} from "./ingest";
import { accessibleProperties } from "./ownership";
import { resultToColumns, resultToExtra } from "./parsers";
import { loadUserConfigs } from "./registry";

/** Reparse — re-run a user's parsers over stored bills and write changed output
 * back. Deliberately free of any Next-only import (no `../trpc`, no
 * `server-only`) so it can run both inside the app (the bills router) and from a
 * plain Node script (the maintainer resync tool). */

type BillRow = typeof bills.$inferSelect;

/** SQL predicate for the bills a user may see: any bill filed into an property
 * they belong to, plus their own still-unfiled inbox uploads. */
export function billsScope(propertyIds: string[], userId: string) {
  const inbox = and(isNull(bills.propertyId), eq(bills.createdBy, userId));
  return propertyIds.length
    ? or(inArray(bills.propertyId, propertyIds), inbox)
    : inbox;
}

/** Compare two numeric DB strings (e.g. "1234.00" vs "1234") by value, so a
 * formatting-only difference doesn't read as a change. */
function sameNum(a: string | null, b: string | null): boolean {
  if (a === null || b === null) return a === b;
  return Number(a) === Number(b);
}

/** Stable stringify (recursively sorted keys) so a jsonb value read back from
 * the DB in any key order compares equal to a freshly built object. */
function canonical(v: unknown): string {
  return JSON.stringify(v, (_k, val) =>
    val && typeof val === "object" && !Array.isArray(val)
      ? Object.fromEntries(
          Object.entries(val as Record<string, unknown>).sort(([a], [b]) =>
            a < b ? -1 : 1,
          ),
        )
      : val,
  );
}

/** Re-run the user's parsers over one bill's stored raw text and write the
 * parsed fields back. A matched account files the bill into its property; an
 * already-filed bill keeps its property (vendor materialized there); an unfiled
 * bill with no known account stays in the inbox with the vendor deferred.
 *
 * The write is skipped when re-running produces exactly what's already stored.
 * Critically, "is this stale?" is decided by re-running and comparing output —
 * NOT by comparing `parserVersion`, which is a per-package counter that isn't
 * comparable across packages: a fork restarts at v1, so an official-vs-fork
 * version compare always looked "older" and silently skipped the bill. Returns
 * true when the bill was actually updated. */
export async function reparseSingle(
  db: typeof Db,
  userId: string,
  accessible: string[],
  bill: BillRow,
  configs: ParserConfig[],
): Promise<boolean> {
  const text = normalize(bill.rawText);
  const config = selectConfig(configs, text);
  if (!config) return false;

  let result;
  try {
    result = runConfig(config, text);
  } catch {
    return false;
  }

  const common = {
    ...resultToColumns(result),
    parserKey: config.slug,
    parserVersion: String(config.version),
  };

  const match = await findAccountMatch(
    db,
    accessible,
    config.vendor.slug,
    result.identity,
  );

  // Build the patch each branch would write, then diff against the stored row.
  let patch: Partial<BillRow>;
  if (match) {
    patch = {
      ...common,
      vendorId: match.vendorId,
      accountId: match.accountId,
      propertyId: match.propertyId,
      extra: resultToExtra(result),
      status: "parsed",
    };
  } else if (bill.propertyId) {
    // Filed already, but no matching account row — keep it in its property and
    // materialize the vendor there.
    const vendor = await ensureVendor(db, bill.propertyId, config.vendor);
    patch = {
      ...common,
      vendorId: vendor.id,
      extra: resultToExtra(result),
      status: "parsed",
    };
  } else if (accessible.length === 1) {
    // Inbox, unknown account, single property: there's only one sensible home,
    // so file it there (materializing the vendor + account) like a matched bill
    // instead of leaving it stuck in needs_review.
    const { vendorId, accountId } = await fileBillIntoProperty(
      db,
      bill.id,
      accessible[0],
      config.vendor,
      result.identity,
    );
    patch = {
      ...common,
      vendorId,
      accountId,
      propertyId: accessible[0],
      extra: resultToExtra(result),
      status: "parsed",
    };
  } else {
    // Inbox, unknown account, multiple properties: refresh fields, keep the
    // vendor deferred until the user picks a property.
    patch = {
      ...common,
      vendorId: null,
      extra: { ...resultToExtra(result), ...vendorMetaExtra(config) },
      status: "needs_review",
    };
  }

  // Only the fields this branch sets are compared; a switch to a different
  // parser (new parserKey/version) or any changed output counts as an update.
  const changed = Object.entries(patch).some(([k, v]) => {
    const cur = bill[k as keyof BillRow];
    if (k === "totalAmount") return !sameNum(cur as string | null, v as string);
    if (k === "extra") return canonical(cur) !== canonical(v);
    return cur !== v;
  });
  if (!changed) return false;

  await db.update(bills).set(patch).where(eq(bills.id, bill.id));
  return true;
}

/** Re-run a user's current parsers over the bills they can access, writing only
 * where output changed. Backs the `reparse` procedure and the maintainer resync
 * script (which reparses on every user's behalf after publishing a new official
 * version). One malformed bill must not abort the batch.
 *
 * `slug` scopes the run to the parser just edited/adopted: only bills that
 * parser owns (`parserKey === slug`) or that no parser has claimed yet
 * (`parserKey` null, so a new/edited parser can pick them up) are touched.
 * Bills owned by a *different* parser are left untouched, so editing the
 * Metrogas parser can't clobber a manual correction on an Edesur bill. Omit
 * `slug` for a full resync across every parser. */
export async function reparseUserBills(
  db: typeof Db,
  userId: string,
  slug?: string,
): Promise<{ scanned: number; updated: number }> {
  const configs = await loadUserConfigs(db, userId);
  const ids = await accessibleProperties(db, userId);
  const scope = billsScope(ids, userId);
  const all = await db.query.bills.findMany({
    where: slug
      ? and(scope, or(eq(bills.parserKey, slug), isNull(bills.parserKey)))
      : scope,
  });
  let updated = 0;
  for (const bill of all) {
    try {
      if (await reparseSingle(db, userId, ids, bill, configs)) updated++;
    } catch {
      // leave it as-is; surfaced individually via the drawer's reparse
    }
  }
  return { scanned: all.length, updated };
}

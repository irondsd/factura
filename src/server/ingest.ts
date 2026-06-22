import { createHash } from "node:crypto";
import { and, eq, inArray, isNull } from "drizzle-orm";
import type { db as Db } from "@/db";
import { bills, properties, vendorAccounts, vendors } from "@/db/schema";
import { runConfig, selectConfig } from "@/parsers/engine/evaluate";
import { ParseError } from "@/parsers/engine/types";
import type { ParserConfig } from "@/parsers/engine/types";
import { normalize } from "@/parsers/normalize";
import { ensureVendor } from "./defaults";
import { accessibleProperties } from "./ownership";
import { resultToColumns, resultToExtra } from "./parsers";
import { loadUserConfigs } from "./registry";

export type IngestResult =
  | { outcome: "duplicate"; billId: string }
  | { outcome: "unrecognized"; billId: string }
  | {
      outcome: "parse_failed";
      billId: string;
      vendorName: string;
      error: string;
    }
  | {
      outcome: "unknown_account";
      billId: string;
      vendorName: string;
      accountNumber: string;
      suggestedPropertyId: string | null;
    }
  | {
      outcome: "parsed";
      billId: string;
      vendorName: string;
      propertyId: string;
      period: string;
      totalAmount: number;
      periodDuplicate: boolean;
    };

export type VendorMeta = {
  slug: string;
  displayName: string;
  category: string;
};

/** Vendor identity carried on an *unfiled* bill (no vendor row yet), so the
 * inbox can show a label and filing can later materialize the real vendor. */
export function vendorMetaExtra(config: ParserConfig) {
  return {
    vendorSlug: config.vendor.slug,
    vendorName: config.vendor.displayName,
    vendorCategory: config.vendor.category,
  };
}

/** Find an existing account for `vendorSlug` + `accountNumber` in one of the
 * given properties. Vendors are per-property, so the match is on vendor slug
 * across the caller's accessible properties. */
export async function findAccountMatch(
  db: typeof Db,
  accessible: string[],
  vendorSlug: string,
  accountNumber: string,
): Promise<
  { accountId: string; propertyId: string; vendorId: string } | undefined
> {
  if (accessible.length === 0) return undefined;
  const [row] = await db
    .select({
      accountId: vendorAccounts.id,
      propertyId: vendorAccounts.propertyId,
      vendorId: vendors.id,
    })
    .from(vendorAccounts)
    .innerJoin(vendors, eq(vendorAccounts.vendorId, vendors.id))
    .where(
      and(
        inArray(vendorAccounts.propertyId, accessible),
        eq(vendors.slug, vendorSlug),
        eq(vendorAccounts.accountNumber, accountNumber),
      ),
    )
    .limit(1);
  return row;
}

/** Read the vendor identity back off an unfiled bill's `extra`. */
export function vendorMetaFromExtra(
  extra: Record<string, unknown>,
): VendorMeta | null {
  const slug = extra.vendorSlug as string | undefined;
  const displayName = extra.vendorName as string | undefined;
  const category = extra.vendorCategory as string | undefined;
  if (!slug || !displayName || !category) return null;
  return { slug, displayName, category };
}

/** Materialize an property's vendor + account for `accountNumber`, point the
 * bill at them and mark it parsed. The single place a bill becomes "filed" into
 * an property — shared by ingest, confirmAccount, manual fill, and reparse. */
export async function fileBillIntoProperty(
  db: typeof Db,
  billId: string,
  propertyId: string,
  vendor: VendorMeta,
  accountNumber: string,
  label?: string,
) {
  const v = await ensureVendor(db, propertyId, vendor);
  let account = await db.query.vendorAccounts.findFirst({
    where: and(
      eq(vendorAccounts.vendorId, v.id),
      eq(vendorAccounts.accountNumber, accountNumber),
    ),
  });
  if (!account) {
    [account] = await db
      .insert(vendorAccounts)
      .values({ vendorId: v.id, propertyId, accountNumber, label })
      .returning();
  }
  const [updated] = await db
    .update(bills)
    .set({
      vendorId: v.id,
      accountId: account.id,
      propertyId,
      status: "parsed",
    })
    .where(eq(bills.id, billId))
    .returning();
  return { updated, vendorId: v.id, accountId: account.id };
}

/** Lowercase, strip diacritics, collapse whitespace — for address matching. */
export function normalizeForMatch(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Address variants must be street + number; matched as substring of the
 * normalized bill text. */
export function matchProperty(
  text: string,
  props: { id: string; addressVariants: string[] }[],
): string | null {
  const haystack = normalizeForMatch(text);
  for (const p of props) {
    for (const variant of p.addressVariants) {
      const needle = normalizeForMatch(variant);
      if (needle.length > 3 && haystack.includes(needle)) return p.id;
    }
  }
  return null;
}

export async function ingestBill(
  db: typeof Db,
  userId: string,
  input: { fileName: string; rawText: string; storageKey?: string },
): Promise<IngestResult> {
  const textHash = createHash("sha256").update(input.rawText).digest("hex");
  const text = normalize(input.rawText);
  // Only the uploader's own + adopted parsers — never the global pool.
  const configs = await loadUserConfigs(db, userId);
  const config = selectConfig(configs, text);

  const base = {
    createdBy: userId,
    fileName: input.fileName,
    storageKey: input.storageKey ?? null,
    rawText: input.rawText,
    textHash,
  };

  // Duplicate check is scoped to where the bill would land: per-property once
  // filed, per-uploader while it sits unfiled in the inbox.
  const inboxDuplicate = () =>
    db.query.bills.findFirst({
      where: and(
        eq(bills.createdBy, userId),
        isNull(bills.propertyId),
        eq(bills.textHash, textHash),
      ),
    });

  if (!config) {
    const dup = await inboxDuplicate();
    if (dup) return { outcome: "duplicate", billId: dup.id };
    const [bill] = await db
      .insert(bills)
      .values({ ...base, status: "needs_review" })
      .returning();
    return { outcome: "unrecognized", billId: bill.id };
  }

  let result;
  try {
    result = runConfig(config, text);
  } catch (err) {
    const message = err instanceof ParseError ? err.message : String(err);
    const dup = await inboxDuplicate();
    if (dup) return { outcome: "duplicate", billId: dup.id };
    const [bill] = await db
      .insert(bills)
      .values({
        ...base,
        status: "needs_review",
        parserKey: config.slug,
        parserVersion: String(config.version),
        extra: { parseError: message, ...vendorMetaExtra(config) },
      })
      .returning();
    return {
      outcome: "parse_failed",
      billId: bill.id,
      vendorName: config.vendor.displayName,
      error: message,
    };
  }

  const billValues = {
    ...base,
    ...resultToColumns(result),
    parserKey: config.slug,
    parserVersion: String(config.version),
  };

  // Find an existing account for this vendor + number in one of the uploader's
  // properties. Vendors are per-property now, so we match on the vendor slug.
  const accessible = await accessibleProperties(db, userId);
  const match = await findAccountMatch(
    db,
    accessible,
    config.vendor.slug,
    result.identity,
  );

  if (!match) {
    // First bill from this account: keep it in the inbox with the vendor identity
    // on `extra`, and ask the user which property once (confirmAccount).
    const dup = await inboxDuplicate();
    if (dup) return { outcome: "duplicate", billId: dup.id };
    const props = accessible.length
      ? await db.query.properties.findMany({
          where: inArray(properties.id, accessible),
        })
      : [];
    const suggestedPropertyId = matchProperty(text, props);
    const [bill] = await db
      .insert(bills)
      .values({
        ...billValues,
        status: "needs_review",
        extra: { ...resultToExtra(result), ...vendorMetaExtra(config) },
      })
      .returning();
    return {
      outcome: "unknown_account",
      billId: bill.id,
      vendorName: config.vendor.displayName,
      accountNumber: result.identity,
      suggestedPropertyId,
    };
  }

  const propertyDuplicate = await db.query.bills.findFirst({
    where: and(
      eq(bills.propertyId, match.propertyId),
      eq(bills.textHash, textHash),
    ),
  });
  if (propertyDuplicate)
    return { outcome: "duplicate", billId: propertyDuplicate.id };

  const periodTwin = await db.query.bills.findFirst({
    where: and(
      eq(bills.accountId, match.accountId),
      eq(bills.period, result.period),
    ),
  });

  const [bill] = await db
    .insert(bills)
    .values({
      ...billValues,
      status: "parsed",
      vendorId: match.vendorId,
      accountId: match.accountId,
      propertyId: match.propertyId,
      extra: resultToExtra(result),
    })
    .returning();

  return {
    outcome: "parsed",
    billId: bill.id,
    vendorName: config.vendor.displayName,
    propertyId: match.propertyId,
    period: result.period,
    totalAmount: result.amount,
    periodDuplicate: Boolean(periodTwin),
  };
}

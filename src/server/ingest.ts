import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { db as Db } from "@/db";
import { bills, properties, vendorAccounts } from "@/db/schema";
import { runConfig, selectConfig } from "@/parsers/engine/evaluate";
import { ParseError } from "@/parsers/engine/types";
import { normalize } from "@/parsers/normalize";
import { ensureVendor } from "./defaults";
import { resultToColumns, resultToExtra } from "./parsers";
import { loadUserConfigs } from "./registry";

export type IngestResult =
  | { outcome: "duplicate"; billId: string }
  | { outcome: "unrecognized"; billId: string }
  | { outcome: "parse_failed"; billId: string; vendorName: string; error: string }
  | {
      outcome: "unknown_account";
      billId: string;
      vendorId: string;
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

  const existing = await db.query.bills.findFirst({
    where: and(eq(bills.userId, userId), eq(bills.textHash, textHash)),
  });
  if (existing) return { outcome: "duplicate", billId: existing.id };

  const text = normalize(input.rawText);
  // Only the user's own + adopted parsers — never the global pool.
  const configs = await loadUserConfigs(db, userId);
  const config = selectConfig(configs, text);

  const base = {
    userId,
    fileName: input.fileName,
    storageKey: input.storageKey ?? null,
    rawText: input.rawText,
    textHash,
  };

  if (!config) {
    const [bill] = await db
      .insert(bills)
      .values({ ...base, status: "needs_review" })
      .returning();
    return { outcome: "unrecognized", billId: bill.id };
  }

  // A matched preset always has a vendor; create the user's vendor row if this
  // is the first time they see this preset.
  const vendor = await ensureVendor(db, userId, config.vendor);

  let result;
  try {
    result = runConfig(config, text);
  } catch (err) {
    const message = err instanceof ParseError ? err.message : String(err);
    const [bill] = await db
      .insert(bills)
      .values({
        ...base,
        status: "needs_review",
        vendorId: vendor.id,
        parserKey: config.slug,
        parserVersion: String(config.version),
        extra: { parseError: message },
      })
      .returning();
    return {
      outcome: "parse_failed",
      billId: bill.id,
      vendorName: vendor.displayName,
      error: message,
    };
  }

  const billValues = {
    ...base,
    vendorId: vendor.id,
    ...resultToColumns(result),
    parserKey: config.slug,
    parserVersion: String(config.version),
    extra: resultToExtra(result),
  };

  const account = await db.query.vendorAccounts.findFirst({
    where: and(
      eq(vendorAccounts.vendorId, vendor.id),
      eq(vendorAccounts.accountNumber, result.identity),
    ),
  });

  if (!account) {
    // First bill from this account: save it, ask the user which property once.
    const props = await db.query.properties.findMany({
      where: eq(properties.userId, userId),
    });
    const suggestedPropertyId = matchProperty(text, props);
    const [bill] = await db
      .insert(bills)
      .values({ ...billValues, status: "needs_review" })
      .returning();
    return {
      outcome: "unknown_account",
      billId: bill.id,
      vendorId: vendor.id,
      vendorName: vendor.displayName,
      accountNumber: result.identity,
      suggestedPropertyId,
    };
  }

  const periodTwin = await db.query.bills.findFirst({
    where: and(
      eq(bills.accountId, account.id),
      eq(bills.period, result.period),
    ),
  });

  const [bill] = await db
    .insert(bills)
    .values({
      ...billValues,
      status: "parsed",
      accountId: account.id,
      propertyId: account.propertyId,
    })
    .returning();

  return {
    outcome: "parsed",
    billId: bill.id,
    vendorName: vendor.displayName,
    propertyId: account.propertyId,
    period: result.period,
    totalAmount: result.amount,
    periodDuplicate: Boolean(periodTwin),
  };
}

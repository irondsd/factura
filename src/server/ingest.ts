import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { db as Db } from "@/db";
import { bills, properties, vendorAccounts, vendors } from "@/db/schema";
import { normalize } from "@/parsers/normalize";
import { findParser } from "@/parsers/registry";
import { ParseError, type ParsedBillFields } from "@/parsers/types";

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
      fields: ParsedBillFields;
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
  const parser = findParser(text);

  const base = {
    userId,
    fileName: input.fileName,
    storageKey: input.storageKey ?? null,
    rawText: input.rawText,
    textHash,
  };

  if (!parser) {
    const [bill] = await db
      .insert(bills)
      .values({ ...base, status: "needs_review" })
      .returning();
    return { outcome: "unrecognized", billId: bill.id };
  }

  const vendor = await db.query.vendors.findFirst({
    where: and(eq(vendors.userId, userId), eq(vendors.slug, parser.vendorSlug)),
  });

  let fields: ParsedBillFields;
  try {
    fields = parser.parse(text);
  } catch (err) {
    const message = err instanceof ParseError ? err.message : String(err);
    const [bill] = await db
      .insert(bills)
      .values({
        ...base,
        status: "needs_review",
        vendorId: vendor?.id,
        parserKey: parser.key,
        parserVersion: String(parser.version),
        extra: { parseError: message },
      })
      .returning();
    return {
      outcome: "parse_failed",
      billId: bill.id,
      vendorName: vendor?.displayName ?? parser.key,
      error: message,
    };
  }

  const billValues = {
    ...base,
    vendorId: vendor?.id,
    period: fields.period,
    totalAmount: String(fields.totalAmount),
    dueDate: fields.dueDate,
    extraordinaryAmount:
      fields.extraordinaryAmount !== undefined
        ? String(fields.extraordinaryAmount)
        : null,
    consumptionValue:
      fields.consumption !== undefined ? String(fields.consumption.value) : null,
    consumptionUnit: fields.consumption?.unit ?? null,
    parserKey: parser.key,
    parserVersion: String(parser.version),
    extra: {
      ...fields.extra,
      periodLabel: fields.periodLabel,
      accountNumber: fields.accountNumber,
    },
  };

  const account = vendor
    ? await db.query.vendorAccounts.findFirst({
        where: and(
          eq(vendorAccounts.vendorId, vendor.id),
          eq(vendorAccounts.accountNumber, fields.accountNumber),
        ),
      })
    : undefined;

  if (!vendor || !account) {
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
      vendorId: vendor?.id ?? "",
      vendorName: vendor?.displayName ?? parser.key,
      accountNumber: fields.accountNumber,
      suggestedPropertyId,
      fields,
    };
  }

  const periodTwin = await db.query.bills.findFirst({
    where: and(
      eq(bills.accountId, account.id),
      eq(bills.period, fields.period),
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
    period: fields.period,
    totalAmount: fields.totalAmount,
    periodDuplicate: Boolean(periodTwin),
  };
}

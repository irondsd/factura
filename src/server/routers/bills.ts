import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray, isNull, or } from "drizzle-orm";
import { after } from "next/server";
import { z } from "zod";
import type { db as Db } from "@/db";
import { bills } from "@/db/schema";
import { runConfig, selectConfig } from "@/parsers/engine/evaluate";
import type { ParserConfig } from "@/parsers/engine/types";
import { normalize } from "@/parsers/normalize";
import { getPostHogClient } from "@/lib/posthog-server";
import { ensureVendor } from "../defaults";
import { billRateDate, usdRateLookup } from "../fx";
import {
  fileBillIntoProperty,
  findAccountMatch,
  ingestBill,
  vendorMetaExtra,
  vendorMetaFromExtra,
} from "../ingest";
import { assertMember, assertMemberVendor, RAW_TEXT_MAX } from "../ownership";
import { resultToColumns, resultToExtra } from "../parsers";
import { loadUserConfigs } from "../registry";
import {
  deleteObject,
  isStorageConfigured,
  presignDownload,
  presignUpload,
} from "../storage";
import { protectedProcedure, router, scopedProcedure } from "../trpc";

const period = z.string().regex(/^\d{4}-\d{2}-01$/);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

type BillRow = typeof bills.$inferSelect;

/** SQL predicate for the bills a user may see: any bill filed into an property
 * they belong to, plus their own still-unfiled inbox uploads. */
function billsScope(propertyIds: string[], userId: string) {
  const inbox = and(isNull(bills.propertyId), eq(bills.createdBy, userId));
  return propertyIds.length
    ? or(inArray(bills.propertyId, propertyIds), inbox)
    : inbox;
}

/** Load one bill if the caller can access it, else 404. */
async function loadAccessibleBill(
  db: typeof Db,
  userId: string,
  propertyIds: string[],
  billId: string,
): Promise<BillRow> {
  const bill = await db.query.bills.findFirst({ where: eq(bills.id, billId) });
  if (!bill) throw new TRPCError({ code: "NOT_FOUND" });
  const ok = bill.propertyId
    ? propertyIds.includes(bill.propertyId)
    : bill.createdBy === userId;
  if (!ok) throw new TRPCError({ code: "NOT_FOUND" });
  return bill;
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
async function reparseSingle(
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

export const billsRouter = router({
  /** Presigned PUT for a direct browser → bucket upload (storage only). */
  presignUpload: protectedProcedure
    .input(z.object({ fileName: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (!isStorageConfigured()) return null;
      return presignUpload(ctx.userId, input.fileName);
    }),

  ingest: protectedProcedure
    .input(
      z.object({
        fileName: z.string(),
        rawText: z.string().min(20).max(RAW_TEXT_MAX),
        storageKey: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // A client-supplied storageKey must live in the caller's own namespace,
      // or `get` could later presign a download of another user's object.
      if (
        input.storageKey &&
        !input.storageKey.startsWith(`bills/${ctx.userId}/`)
      )
        throw new TRPCError({ code: "FORBIDDEN" });
      const result = await ingestBill(ctx.db, ctx.userId, input);
      // Analytics must never block or fail the response — the bill is already
      // saved. `after` runs this once the response is sent (Vercel keeps the
      // invocation alive via waitUntil), so a slow/hung PostHog flush can't make
      // a successful ingest look like a failed one to the client.
      after(async () => {
        const posthog = getPostHogClient();
        posthog.capture({
          distinctId: ctx.userId,
          event: "bill_ingested",
          properties: {
            outcome: result.outcome,
            file_name: input.fileName,
          },
        });
        await posthog.shutdown();
      });
      return result;
    }),

  list: scopedProcedure
    .input(
      z.object({
        status: z.enum(["parsed", "needs_review"]).optional(),
        propertyId: z.string().uuid().optional(),
        limit: z.number().int().min(1).max(200).default(50),
      }),
    )
    .query(async ({ ctx, input }) => {
      const ids = ctx.accessiblePropertyIds;
      if (input.propertyId && !ids.includes(input.propertyId)) return [];
      const scope = input.propertyId
        ? eq(bills.propertyId, input.propertyId)
        : billsScope(ids, ctx.userId);
      return ctx.db.query.bills.findMany({
        where: and(
          scope,
          input.status ? eq(bills.status, input.status) : undefined,
        ),
        orderBy: [desc(bills.createdAt)],
        limit: input.limit,
        columns: { rawText: false },
      });
    }),

  /** Distinct vendors that actually have bills (optionally for one property) —
   * drives the ledger's vendor filter tabs, independent of account rows. */
  vendorsPresent: scopedProcedure
    .input(z.object({ propertyId: z.string().uuid().optional() }))
    .query(async ({ ctx, input }) => {
      const ids = ctx.accessiblePropertyIds;
      if (input.propertyId && !ids.includes(input.propertyId)) return [];
      const scope = input.propertyId
        ? eq(bills.propertyId, input.propertyId)
        : billsScope(ids, ctx.userId);
      const rows = await ctx.db
        .selectDistinct({ vendorId: bills.vendorId })
        .from(bills)
        .where(scope);
      return rows
        .map((r) => r.vendorId)
        .filter((id): id is string => id !== null);
    }),

  /** Paginated ledger for the Bills screen: review-needed first, then newest
   * period; USD-enriched. */
  listPaged: scopedProcedure
    .input(
      z.object({
        propertyId: z.string().uuid().optional(),
        vendorId: z.string().uuid().optional(),
        page: z.number().int().min(0).default(0),
        perPage: z.number().int().min(1).max(50).default(10),
      }),
    )
    .query(async ({ ctx, input }) => {
      const ids = ctx.accessiblePropertyIds;
      if (input.propertyId && !ids.includes(input.propertyId))
        return { rows: [], total: 0, page: 0, pageCount: 1 };
      const scope = input.propertyId
        ? eq(bills.propertyId, input.propertyId)
        : billsScope(ids, ctx.userId);
      const rows = await ctx.db.query.bills.findMany({
        where: and(
          scope,
          input.vendorId ? eq(bills.vendorId, input.vendorId) : undefined,
        ),
        columns: { rawText: false },
      });
      rows.sort((a, b) => {
        if ((a.status === "needs_review") !== (b.status === "needs_review"))
          return a.status === "needs_review" ? -1 : 1;
        return (a.period ?? "0") < (b.period ?? "0") ? 1 : -1;
      });

      const pageCount = Math.max(1, Math.ceil(rows.length / input.perPage));
      const page = Math.min(input.page, pageCount - 1);
      const slice = rows.slice(
        page * input.perPage,
        page * input.perPage + input.perPage,
      );

      const rateFor = await usdRateLookup(ctx.db, slice.map(billRateDate));
      const pageRows = slice.map((b) => {
        const rate = rateFor(billRateDate(b));
        return {
          ...b,
          usdAmount:
            rate && b.totalAmount !== null
              ? Number(b.totalAmount) / rate
              : null,
        };
      });

      return { rows: pageRows, total: rows.length, page, pageCount };
    }),

  /** Full bill incl. raw extracted text, a presigned link to the stored PDF,
   * and the year-over-year delta — everything the editor drawer needs. */
  get: scopedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const ids = ctx.accessiblePropertyIds;
      const bill = await loadAccessibleBill(ctx.db, ctx.userId, ids, input.id);
      const downloadUrl =
        bill.storageKey && isStorageConfigured()
          ? await presignDownload(bill.storageKey)
          : null;

      // Year-over-year: same vendor/property, 12 months earlier.
      let yoy: {
        prevPeriod: string;
        arsPct: number | null;
        usdPct: number | null;
      } | null = null;
      if (bill.period && bill.vendorId && bill.propertyId) {
        // `period` is a Postgres `date` column, so the comparison value must be
        // a full YYYY-MM-DD — `2023-03` would fail to cast and 500 the query.
        const [y, m, day] = bill.period.split("-");
        const prevPeriod = `${Number(y) - 1}-${m}-${day}`;
        const prev = await ctx.db.query.bills.findFirst({
          where: and(
            eq(bills.status, "parsed"),
            eq(bills.vendorId, bill.vendorId),
            eq(bills.propertyId, bill.propertyId),
            eq(bills.period, prevPeriod),
          ),
        });
        if (prev?.totalAmount && bill.totalAmount) {
          const rateFor = await usdRateLookup(ctx.db, [
            billRateDate(bill),
            billRateDate(prev),
          ]);
          const usd = (b: typeof bill) => {
            const rate = rateFor(billRateDate(b));
            return rate && b.totalAmount ? Number(b.totalAmount) / rate : null;
          };
          const curUsd = usd(bill);
          const prevUsd = usd(prev);
          yoy = {
            prevPeriod,
            arsPct:
              ((Number(bill.totalAmount) - Number(prev.totalAmount)) /
                Number(prev.totalAmount)) *
              100,
            usdPct:
              curUsd != null && prevUsd
                ? ((curUsd - prevUsd) / prevUsd) * 100
                : null,
          };
        }
      }
      return { ...bill, downloadUrl, yoy };
    }),

  /** Manual fill from the editor drawer / review inbox. Assigning a property to
   * a parsed-but-unfiled bill that carries a vendor identity also materializes
   * its vendor + account, so the rest of that account's bills resolve on their
   * own. */
  update: scopedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        vendorId: z.string().uuid().optional(),
        propertyId: z.string().uuid().optional(),
        period: period.optional(),
        totalAmount: z.number().nonnegative().optional(),
        dueDate: isoDate.optional(),
        // Manually entered parser custom fields ({ name: value }); merged into
        // extra.fields so a bill the parser couldn't fill can be hand-completed.
        custom: z.record(z.string(), z.unknown()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const ids = ctx.accessiblePropertyIds;
      const bill = await loadAccessibleBill(ctx.db, ctx.userId, ids, input.id);

      // Filing is a member action; vendor must live in an accessible property.
      if (input.propertyId)
        await assertMember(ctx.db, ctx.userId, input.propertyId);
      if (input.vendorId)
        await assertMemberVendor(ctx.db, ctx.userId, input.vendorId);

      const { id, totalAmount, vendorId, propertyId, custom, ...rest } = input;

      // Parsed/unknown-account bill being filed: materialize vendor + account
      // from the identity the parser stashed on `extra`.
      const extra = (bill.extra ?? {}) as Record<string, unknown>;
      const meta = vendorMetaFromExtra(extra);
      const accountNumber = extra.accountNumber as string | undefined;
      if (propertyId && !bill.accountId && meta && accountNumber) {
        await fileBillIntoProperty(
          ctx.db,
          bill.id,
          propertyId,
          meta,
          accountNumber,
        );
      }

      // Hand-filled custom fields merge into extra.fields, leaving the rest of
      // extra (accountNumber, vendor identity, …) intact.
      const nextExtra = custom
        ? {
            ...extra,
            fields: {
              ...((extra.fields as Record<string, unknown>) ?? {}),
              ...custom,
            },
          }
        : undefined;

      const [updated] = await ctx.db
        .update(bills)
        .set({
          ...rest,
          ...(vendorId ? { vendorId } : {}),
          ...(propertyId ? { propertyId } : {}),
          ...(totalAmount !== undefined
            ? { totalAmount: String(totalAmount) }
            : {}),
          ...(nextExtra ? { extra: nextExtra } : {}),
          status: "parsed",
        })
        .where(eq(bills.id, id))
        .returning();
      if (!updated) throw new TRPCError({ code: "NOT_FOUND" });
      return updated;
    }),

  /** One-click answer to "new account NNN — which property?" Materializes the
   * property's vendor + account and finalizes the bill; never asked again. */
  confirmAccount: scopedProcedure
    .input(
      z.object({
        billId: z.string().uuid(),
        propertyId: z.string().uuid(),
        label: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertMember(ctx.db, ctx.userId, input.propertyId);
      const ids = ctx.accessiblePropertyIds;
      const bill = await loadAccessibleBill(
        ctx.db,
        ctx.userId,
        ids,
        input.billId,
      );
      const extra = (bill.extra ?? {}) as Record<string, unknown>;
      const meta = vendorMetaFromExtra(extra);
      const accountNumber = extra.accountNumber as string | undefined;
      if (!meta || !accountNumber)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Bill has no extracted account number",
        });
      const { updated } = await fileBillIntoProperty(
        ctx.db,
        bill.id,
        input.propertyId,
        meta,
        accountNumber,
        input.label,
      );
      return updated;
    }),

  /** Re-run current parsers over stored raw text for every accessible bill.
   * Backfills new fields, rescues needs_review bills, and switches a bill to a
   * newly-forked/adopted parser. `reparseSingle` re-parses and only writes when
   * the output actually changes, so the count reflects real updates. */
  reparse: scopedProcedure.mutation(async ({ ctx }) => {
    const configs = await loadUserConfigs(ctx.db, ctx.userId);
    const ids = ctx.accessiblePropertyIds;
    const all = await ctx.db.query.bills.findMany({
      where: billsScope(ids, ctx.userId),
    });
    let updated = 0;
    for (const bill of all) {
      // One malformed bill must not abort the whole batch.
      try {
        if (await reparseSingle(ctx.db, ctx.userId, ids, bill, configs))
          updated++;
      } catch {
        // leave it as-is; surfaced individually via the drawer's reparse
      }
    }
    return { scanned: all.length, updated };
  }),

  /** Drawer "From the text" path: re-run the parser on the stored text. */
  reparseText: scopedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const ids = ctx.accessiblePropertyIds;
      const bill = await loadAccessibleBill(ctx.db, ctx.userId, ids, input.id);
      const configs = await loadUserConfigs(ctx.db, ctx.userId);
      const updated = await reparseSingle(
        ctx.db,
        ctx.userId,
        ids,
        bill,
        configs,
      );
      return { updated };
    }),

  /** Drawer "From the file" path: the client re-extracts text from the stored
   * PDF (pdf.js), we replace the stored text and re-run the parser. */
  reparseFile: scopedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        rawText: z.string().min(20).max(RAW_TEXT_MAX),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const ids = ctx.accessiblePropertyIds;
      const bill = await loadAccessibleBill(ctx.db, ctx.userId, ids, input.id);
      await ctx.db
        .update(bills)
        .set({ rawText: input.rawText })
        .where(eq(bills.id, bill.id));
      const configs = await loadUserConfigs(ctx.db, ctx.userId);
      const updated = await reparseSingle(
        ctx.db,
        ctx.userId,
        ids,
        { ...bill, rawText: input.rawText },
        configs,
      );
      return { updated };
    }),

  delete: scopedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const ids = ctx.accessiblePropertyIds;
      const bill = await loadAccessibleBill(ctx.db, ctx.userId, ids, input.id);
      // Drop the stored PDF first: if storage is unreachable this throws and
      // leaves the DB row intact, so we never orphan the object in the bucket.
      if (bill.storageKey && isStorageConfigured())
        await deleteObject(bill.storageKey);
      await ctx.db.delete(bills).where(eq(bills.id, input.id));
      return { ok: true };
    }),
});

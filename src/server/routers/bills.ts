import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import type { db as Db } from "@/db";
import { bills } from "@/db/schema";
import { billRateDate, usdRateLookup } from "../fx";
import { fileBillIntoProperty, vendorMetaFromExtra } from "../ingest";
import { assertMember, assertMemberVendor } from "../ownership";
import { extractPdfText } from "../pdf";
import { loadUserConfigs } from "../registry";
import { billsScope, reparseSingle, reparseUserBills } from "../reparse";
import {
  deleteObject,
  getObjectBytes,
  isStorageConfigured,
  presignDownload,
} from "../storage";
import { router, scopedProcedure } from "../trpc";

const period = z.string().regex(/^\d{4}-\d{2}-01$/);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

type BillRow = typeof bills.$inferSelect;

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

export const billsRouter = router({
  // Upload/ingest now lives in the POST /api/bills/ingest route handler — it needs
  // the raw file bytes for server-side extraction, which tRPC's JSON transport
  // can't carry. See src/app/api/bills/ingest/route.ts.

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

  /** Re-run current parsers over stored raw text. Backfills new fields, rescues
   * needs_review bills, and switches a bill to a newly-forked/adopted parser.
   * `reparseSingle` re-parses and only writes when the output actually changes,
   * so the count reflects real updates.
   *
   * `slug` scopes the run to the parser just saved/adopted so unrelated bills
   * (owned by other parsers) aren't re-derived — protecting their manual
   * corrections. Omitted = full resync across every parser. */
  reparse: scopedProcedure
    .input(z.object({ slug: z.string().optional() }).optional())
    .mutation(async ({ ctx, input }) => {
      return reparseUserBills(ctx.db, ctx.userId, input?.slug);
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

  /** Drawer "From the file" path: re-extract text from the stored PDF server-side
   * (same pinned pdf.js as ingest), replace the stored text, and re-run the parser. */
  reparseFile: scopedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const ids = ctx.accessiblePropertyIds;
      const bill = await loadAccessibleBill(ctx.db, ctx.userId, ids, input.id);
      if (!bill.storageKey || !isStorageConfigured())
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "No stored PDF to re-read",
        });
      const bytes = await getObjectBytes(bill.storageKey);
      const rawText = await extractPdfText(bytes);
      await ctx.db
        .update(bills)
        .set({ rawText })
        .where(eq(bills.id, bill.id));
      const configs = await loadUserConfigs(ctx.db, ctx.userId);
      const updated = await reparseSingle(
        ctx.db,
        ctx.userId,
        ids,
        { ...bill, rawText },
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

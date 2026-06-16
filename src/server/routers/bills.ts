import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import type { db as Db } from "@/db";
import { bills, vendorAccounts } from "@/db/schema";
import { runConfig, selectConfig } from "@/parsers/engine/evaluate";
import type { ParserConfig } from "@/parsers/engine/types";
import { normalize } from "@/parsers/normalize";
import { ensureVendor } from "../defaults";
import { billRateDate, usdRateLookup } from "../fx";
import { ingestBill } from "../ingest";
import { loadParserConfigs, resultToColumns, resultToExtra } from "../parsers";
import {
  isStorageConfigured,
  presignDownload,
  presignUpload,
} from "../storage";
import { protectedProcedure, router } from "../trpc";

const period = z.string().regex(/^\d{4}-\d{2}-01$/);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

type BillRow = typeof bills.$inferSelect;

/** Re-run current parsers over one bill's stored raw text and write the parsed
 * fields back. Shared by the global reparse and the per-bill drawer actions.
 * Returns true when the bill was updated. */
async function reparseSingle(
  db: typeof Db,
  userId: string,
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

  // Bills ingested before this preset existed have no vendor yet — resolve (and
  // lazily create) it from the preset, exactly like ingest does.
  const vendor = await ensureVendor(db, userId, config.vendor);
  const account = await db.query.vendorAccounts.findFirst({
    where: and(
      eq(vendorAccounts.vendorId, vendor.id),
      eq(vendorAccounts.accountNumber, result.identity),
    ),
  });

  await db
    .update(bills)
    .set({
      vendorId: vendor.id,
      ...resultToColumns(result),
      parserKey: config.slug,
      parserVersion: String(config.version),
      extra: { ...resultToExtra(result), parseError: undefined },
      // Keep manual property assignment unless the account resolves.
      ...(account
        ? {
            accountId: account.id,
            propertyId: account.propertyId,
            status: "parsed" as const,
          }
        : bill.propertyId
          ? { status: "parsed" as const }
          : {}),
    })
    .where(and(eq(bills.id, bill.id), eq(bills.userId, userId)));
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
        rawText: z.string().min(20),
        storageKey: z.string().optional(),
      }),
    )
    .mutation(({ ctx, input }) => ingestBill(ctx.db, ctx.userId, input)),

  list: protectedProcedure
    .input(
      z.object({
        status: z.enum(["parsed", "needs_review"]).optional(),
        propertyId: z.string().uuid().optional(),
        limit: z.number().int().min(1).max(200).default(50),
      }),
    )
    .query(({ ctx, input }) =>
      ctx.db.query.bills.findMany({
        where: and(
          eq(bills.userId, ctx.userId),
          input.status ? eq(bills.status, input.status) : undefined,
          input.propertyId ? eq(bills.propertyId, input.propertyId) : undefined,
        ),
        orderBy: [desc(bills.createdAt)],
        limit: input.limit,
        columns: { rawText: false },
      }),
    ),

  /** Distinct vendors that actually have bills (optionally for one property) —
   * drives the ledger's vendor filter tabs, independent of account rows. */
  vendorsPresent: protectedProcedure
    .input(z.object({ propertyId: z.string().uuid().optional() }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db
        .selectDistinct({ vendorId: bills.vendorId })
        .from(bills)
        .where(
          and(
            eq(bills.userId, ctx.userId),
            input.propertyId ? eq(bills.propertyId, input.propertyId) : undefined,
          ),
        );
      return rows
        .map((r) => r.vendorId)
        .filter((id): id is string => id !== null);
    }),

  /** Paginated ledger for the Bills screen: review-needed first, then newest
   * period; USD-enriched. */
  listPaged: protectedProcedure
    .input(
      z.object({
        propertyId: z.string().uuid().optional(),
        vendorId: z.string().uuid().optional(),
        page: z.number().int().min(0).default(0),
        perPage: z.number().int().min(1).max(50).default(9),
      }),
    )
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db.query.bills.findMany({
        where: and(
          eq(bills.userId, ctx.userId),
          input.propertyId ? eq(bills.propertyId, input.propertyId) : undefined,
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
  get: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const bill = await ctx.db.query.bills.findFirst({
        where: and(eq(bills.id, input.id), eq(bills.userId, ctx.userId)),
      });
      if (!bill) throw new TRPCError({ code: "NOT_FOUND" });
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
      if (bill.period && bill.vendorId) {
        // `period` is a Postgres `date` column, so the comparison value must be
        // a full YYYY-MM-DD — `2023-03` would fail to cast and 500 the query.
        const [y, m, day] = bill.period.split("-");
        const prevPeriod = `${Number(y) - 1}-${m}-${day}`;
        const prev = await ctx.db.query.bills.findFirst({
          where: and(
            eq(bills.userId, ctx.userId),
            eq(bills.status, "parsed"),
            eq(bills.vendorId, bill.vendorId),
            eq(bills.period, prevPeriod),
            bill.propertyId
              ? eq(bills.propertyId, bill.propertyId)
              : undefined,
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

  /** Manual fill from the editor drawer / review inbox. */
  update: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        vendorId: z.string().uuid().optional(),
        propertyId: z.string().uuid().optional(),
        period: period.optional(),
        totalAmount: z.number().nonnegative().optional(),
        dueDate: isoDate.optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, totalAmount, ...rest } = input;

      // Assigning a property to a parsed-but-unlinked bill should also create the
      // vendor account, so the rest of that account's bills resolve on their own.
      let accountId: string | undefined;
      if (input.propertyId) {
        const bill = await ctx.db.query.bills.findFirst({
          where: and(eq(bills.id, id), eq(bills.userId, ctx.userId)),
        });
        const accountNumber = (bill?.extra as Record<string, unknown> | undefined)
          ?.accountNumber as string | undefined;
        if (bill && bill.vendorId && !bill.accountId && accountNumber) {
          let account = await ctx.db.query.vendorAccounts.findFirst({
            where: and(
              eq(vendorAccounts.vendorId, bill.vendorId),
              eq(vendorAccounts.accountNumber, accountNumber),
            ),
          });
          if (!account) {
            [account] = await ctx.db
              .insert(vendorAccounts)
              .values({
                userId: ctx.userId,
                vendorId: bill.vendorId,
                propertyId: input.propertyId,
                accountNumber,
              })
              .returning();
          }
          accountId = account.id;
        }
      }

      const [updated] = await ctx.db
        .update(bills)
        .set({
          ...rest,
          ...(accountId ? { accountId } : {}),
          ...(totalAmount !== undefined
            ? { totalAmount: String(totalAmount) }
            : {}),
          status: "parsed",
        })
        .where(and(eq(bills.id, id), eq(bills.userId, ctx.userId)))
        .returning();
      if (!updated) throw new TRPCError({ code: "NOT_FOUND" });
      return updated;
    }),

  /** One-click answer to "new account NNN — which property?" Creates the
   * account and finalizes the bill; the question is never asked again. */
  confirmAccount: protectedProcedure
    .input(
      z.object({
        billId: z.string().uuid(),
        propertyId: z.string().uuid(),
        label: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const bill = await ctx.db.query.bills.findFirst({
        where: and(eq(bills.id, input.billId), eq(bills.userId, ctx.userId)),
      });
      if (!bill?.vendorId) throw new TRPCError({ code: "NOT_FOUND" });
      const accountNumber = (bill.extra as Record<string, unknown>)
        .accountNumber as string | undefined;
      if (!accountNumber)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Bill has no extracted account number",
        });

      let account = await ctx.db.query.vendorAccounts.findFirst({
        where: and(
          eq(vendorAccounts.vendorId, bill.vendorId),
          eq(vendorAccounts.accountNumber, accountNumber),
        ),
      });
      if (!account) {
        [account] = await ctx.db
          .insert(vendorAccounts)
          .values({
            userId: ctx.userId,
            vendorId: bill.vendorId,
            propertyId: input.propertyId,
            accountNumber,
            label: input.label,
          })
          .returning();
      }

      const [updated] = await ctx.db
        .update(bills)
        .set({
          accountId: account.id,
          propertyId: account.propertyId,
          status: "parsed",
        })
        .where(eq(bills.id, bill.id))
        .returning();
      return updated;
    }),

  /** Re-run current parsers over stored raw text for every bill. Backfills new
   * fields and rescues needs_review bills after parser improvements. */
  reparse: protectedProcedure.mutation(async ({ ctx }) => {
    const configs = await loadParserConfigs(ctx.db);
    const all = await ctx.db.query.bills.findMany({
      where: eq(bills.userId, ctx.userId),
    });
    let updated = 0;
    for (const bill of all) {
      const text = normalize(bill.rawText);
      const config = selectConfig(configs, text);
      if (!config) continue;
      const isStale =
        bill.status === "needs_review" ||
        bill.parserKey !== config.slug ||
        Number(bill.parserVersion ?? 0) < config.version;
      if (!isStale) continue;
      // One malformed bill must not abort the whole batch.
      try {
        if (await reparseSingle(ctx.db, ctx.userId, bill, configs)) updated++;
      } catch {
        // leave it as-is; surfaced individually via the drawer's reparse
      }
    }
    return { scanned: all.length, updated };
  }),

  /** Drawer "From the text" path: re-run the parser on the stored text. */
  reparseText: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const bill = await ctx.db.query.bills.findFirst({
        where: and(eq(bills.id, input.id), eq(bills.userId, ctx.userId)),
      });
      if (!bill) throw new TRPCError({ code: "NOT_FOUND" });
      const configs = await loadParserConfigs(ctx.db);
      const updated = await reparseSingle(ctx.db, ctx.userId, bill, configs);
      return { updated };
    }),

  /** Drawer "From the file" path: the client re-extracts text from the stored
   * PDF (pdf.js), we replace the stored text and re-run the parser. */
  reparseFile: protectedProcedure
    .input(z.object({ id: z.string().uuid(), rawText: z.string().min(20) }))
    .mutation(async ({ ctx, input }) => {
      const bill = await ctx.db.query.bills.findFirst({
        where: and(eq(bills.id, input.id), eq(bills.userId, ctx.userId)),
      });
      if (!bill) throw new TRPCError({ code: "NOT_FOUND" });
      await ctx.db
        .update(bills)
        .set({ rawText: input.rawText })
        .where(and(eq(bills.id, bill.id), eq(bills.userId, ctx.userId)));
      const configs = await loadParserConfigs(ctx.db);
      const updated = await reparseSingle(
        ctx.db,
        ctx.userId,
        { ...bill, rawText: input.rawText },
        configs,
      );
      return { updated };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .delete(bills)
        .where(and(eq(bills.id, input.id), eq(bills.userId, ctx.userId)));
      return { ok: true };
    }),
});

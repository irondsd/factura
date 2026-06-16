import { TRPCError } from "@trpc/server";
import { and, asc, count, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { bills, parserConfigs, parserSamples } from "@/db/schema";
import {
  detectScore,
  runConfig,
  selectConfig,
} from "@/parsers/engine/evaluate";
import { ParseError, type ParserConfig } from "@/parsers/engine/types";
import { normalize } from "@/parsers/normalize";
import {
  configInputSchema,
  detectSchema,
  toEngineConfig,
} from "../parserSchema";
import { loadParserConfigs, rowToConfig } from "../parsers";
import { protectedProcedure, router } from "../trpc";

/** App-wide parser presets: CRUD plus the two builder-page primitives —
 * `detect` (drop a bill, find the matching preset) and `test` (run a draft
 * config against a bill before saving). Not user-scoped; any signed-in user can
 * manage presets. */
export const parsersRouter = router({
  list: protectedProcedure.query(({ ctx }) =>
    ctx.db.query.parserConfigs.findMany({
      orderBy: [asc(parserConfigs.displayName)],
    }),
  ),

  get: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const row = await ctx.db.query.parserConfigs.findFirst({
        where: eq(parserConfigs.id, input.id),
      });
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      return row;
    }),

  create: protectedProcedure
    .input(configInputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const [row] = await ctx.db
          .insert(parserConfigs)
          .values({
            slug: input.slug,
            version: input.version ?? 1,
            vendorSlug: input.vendorSlug,
            displayName: input.displayName,
            category: input.category,
            body: input.definition,
          })
          .returning();
        return row;
      } catch {
        throw new TRPCError({
          code: "CONFLICT",
          message: `A preset with slug "${input.slug}" already exists`,
        });
      }
    }),

  /** Replace a preset's definition and metadata. Version is bumped so the global
   * reparse re-runs it over existing bills. */
  update: protectedProcedure
    .input(configInputSchema.extend({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.parserConfigs.findFirst({
        where: eq(parserConfigs.id, input.id),
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
      const [row] = await ctx.db
        .update(parserConfigs)
        .set({
          slug: input.slug,
          version: existing.version + 1,
          vendorSlug: input.vendorSlug,
          displayName: input.displayName,
          category: input.category,
          body: input.definition,
          updatedAt: new Date(),
        })
        .where(eq(parserConfigs.id, input.id))
        .returning();
      return row;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .delete(parserConfigs)
        .where(eq(parserConfigs.id, input.id));
      return { ok: true };
    }),

  /** Builder step 0: drop a bill, see which preset (if any) claims it and what
   * it extracts. Returns the normalized text so the builder can show it. */
  detect: protectedProcedure
    .input(z.object({ rawText: z.string().min(20) }))
    .mutation(async ({ ctx, input }) => {
      const text = normalize(input.rawText);
      const rows = await ctx.db.query.parserConfigs.findMany();
      const bySlug = new Map(rows.map((r) => [r.slug, r]));
      const configs = rows.map(rowToConfig);
      const config = selectConfig(configs, text);

      if (!config) {
        return { text, match: null, result: null, error: null };
      }
      let result = null;
      let error: string | null = null;
      try {
        result = runConfig(config, text);
      } catch (err) {
        error = err instanceof ParseError ? err.message : String(err);
      }
      return { text, match: bySlug.get(config.slug) ?? null, result, error };
    }),

  /** Builder step 1+2: run a draft (possibly unsaved) config against a bill.
   * Reports whether detection matched and what extraction produced — the live
   * preview / "test against a new bill" backend. */
  test: protectedProcedure
    .input(configInputSchema.extend({ rawText: z.string().min(20) }))
    .mutation(({ input }) => {
      const { rawText, ...configInput } = input;
      const text = normalize(rawText);
      const config = toEngineConfig(configInput);
      const detected = detectScore(config, text) !== null;
      try {
        const result = runConfig(config, text);
        return { text, detected, result, error: null };
      } catch (err) {
        const error = err instanceof ParseError ? err.message : String(err);
        return { text, detected, result: null, error };
      }
    }),

  /** Builder gate: would this candidate detection block claim any of the user's
   * OTHER bills? Step 2 is only unlocked when this is empty. Runs against the
   * user's own bills only — no cross-user data is read. */
  detectCollisions: protectedProcedure
    .input(z.object({ detect: detectSchema, excludeSlug: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const probe = { detect: input.detect } as ParserConfig;
      const userBills = await ctx.db.query.bills.findMany({
        where: eq(bills.userId, ctx.userId),
        orderBy: [desc(bills.createdAt)],
      });
      const collisions: { id: string; fileName: string | null; parserKey: string | null }[] =
        [];
      for (const b of userBills) {
        // Only bills already claimed by a *different* parser are conflicts.
        // Unrecognized bills (no parserKey) — including the one being built
        // from — are valid targets, not collisions.
        if (!b.parserKey || b.parserKey === input.excludeSlug) continue;
        if (detectScore(probe, normalize(b.rawText)) !== null) {
          collisions.push({ id: b.id, fileName: b.fileName, parserKey: b.parserKey });
        }
      }
      return collisions;
    }),

  /** How many of the user's bills currently use a preset — shown before save so
   * the reparse is explicit ("saving will re-run against N bills"). */
  usage: protectedProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ ctx, input }) => {
      const [row] = await ctx.db
        .select({ n: count() })
        .from(bills)
        .where(and(eq(bills.userId, ctx.userId), eq(bills.parserKey, input.slug)));
      return { count: row?.n ?? 0 };
    }),

  // ── Regression samples (per-user) ──────────────────────────────────────────
  listSamples: protectedProcedure
    .input(z.object({ slug: z.string() }))
    .query(({ ctx, input }) =>
      ctx.db.query.parserSamples.findMany({
        where: and(
          eq(parserSamples.userId, ctx.userId),
          eq(parserSamples.slug, input.slug),
        ),
        orderBy: [asc(parserSamples.createdAt)],
      }),
    ),

  addSample: protectedProcedure
    .input(
      z.object({
        slug: z.string(),
        fileName: z.string().optional(),
        rawText: z.string().min(20),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [row] = await ctx.db
        .insert(parserSamples)
        .values({
          userId: ctx.userId,
          slug: input.slug,
          fileName: input.fileName,
          rawText: input.rawText,
        })
        .returning();
      return row;
    }),

  deleteSample: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .delete(parserSamples)
        .where(
          and(
            eq(parserSamples.id, input.id),
            eq(parserSamples.userId, ctx.userId),
          ),
        );
      return { ok: true };
    }),

  /** Re-run detection across all presets and report load/compile health. Useful
   * for the builder's preset list. */
  configs: protectedProcedure.query(async ({ ctx }) => {
    const configs = await loadParserConfigs(ctx.db);
    return configs.map((c) => ({ slug: c.slug, version: c.version }));
  }),
});

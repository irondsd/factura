import { TRPCError } from "@trpc/server";
import { and, asc, count, desc, eq, inArray, ne } from "drizzle-orm";
import { z } from "zod";
import {
  bills,
  parserAdoptions,
  parserConfigs,
  parserSamples,
  parserVersions,
} from "@/db/schema";
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
import { RAW_TEXT_MAX } from "../ownership";
import {
  adoptPackage,
  assertOwnsPackage,
  loadUserConfigs,
  publishPackage,
  unadoptPackage,
} from "../registry";
import { protectedProcedure, router } from "../trpc";

/** Parser packages: each is owned by one user. Only the owner edits, and a
 * package only affects another user once they deliberately `adopt` a published
 * version of it. CRUD here is owner-scoped; `browse`/`adopt` are the registry
 * side; `detect`/`test` are the builder primitives. */
export const parsersRouter = router({
  /** The packages this user can manage or sees in their builder: their own
   * (editable) plus the ones they've adopted (read-only). */
  list: protectedProcedure.query(async ({ ctx }) => {
    const own = await ctx.db.query.parserConfigs.findMany({
      where: eq(parserConfigs.ownerId, ctx.userId),
      orderBy: [asc(parserConfigs.displayName)],
    });
    // Highest published version per own package, so the UI can show publish
    // state (null = never published; < draft version = unpublished changes).
    const latestPublished = new Map<string, number>();
    if (own.length > 0) {
      const versions = await ctx.db.query.parserVersions.findMany({
        where: inArray(
          parserVersions.configId,
          own.map((r) => r.id),
        ),
      });
      for (const v of versions) {
        const cur = latestPublished.get(v.configId) ?? 0;
        if (v.version > cur) latestPublished.set(v.configId, v.version);
      }
    }
    const adoptions = await ctx.db.query.parserAdoptions.findMany({
      where: eq(parserAdoptions.userId, ctx.userId),
    });
    const adopted = await Promise.all(
      adoptions.map(async (a) => {
        const v = await ctx.db.query.parserVersions.findFirst({
          where: eq(parserVersions.id, a.versionId),
        });
        const c = v?.config as ParserConfig | undefined;
        if (!c) return null;
        return {
          id: a.configId,
          slug: c.slug,
          version: c.version,
          vendorSlug: c.vendor.slug,
          displayName: c.vendor.displayName,
          category: c.vendor.category,
          body: c,
          editable: false as const,
        };
      }),
    );
    return [
      ...own.map((r) => ({
        ...r,
        editable: true as const,
        latestPublishedVersion: latestPublished.get(r.id) ?? null,
      })),
      ...adopted.filter((x): x is NonNullable<typeof x> => x !== null),
    ];
  }),

  get: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const row = await ctx.db.query.parserConfigs.findFirst({
        where: eq(parserConfigs.id, input.id),
      });
      // Readable only if you own it, it's verified/official, or you've adopted
      // it — otherwise another user's private draft would leak.
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      if (row.ownerId !== ctx.userId && !row.verified) {
        const adoption = await ctx.db.query.parserAdoptions.findFirst({
          where: and(
            eq(parserAdoptions.userId, ctx.userId),
            eq(parserAdoptions.configId, input.id),
          ),
        });
        if (!adoption) throw new TRPCError({ code: "NOT_FOUND" });
      }
      return { ...row, editable: row.ownerId === ctx.userId };
    }),

  create: protectedProcedure
    .input(configInputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const [row] = await ctx.db
          .insert(parserConfigs)
          .values({
            ownerId: ctx.userId,
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
          message: `You already have a parser with slug "${input.slug}"`,
        });
      }
    }),

  /** Replace the owner's draft. Owner-only. `version` is bumped so the owner's
   * own reparse re-runs it over their bills; it doesn't touch adopters until the
   * owner `publish`es a new version. */
  update: protectedProcedure
    .input(configInputSchema.extend({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await assertOwnsPackage(ctx.db, ctx.userId, input.id);
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
      await assertOwnsPackage(ctx.db, ctx.userId, input.id);
      await ctx.db.delete(parserConfigs).where(eq(parserConfigs.id, input.id));
      return { ok: true };
    }),

  /** Freeze the current draft as an immutable published version that others can
   * adopt. Owner-only. */
  publish: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const version = await publishPackage(ctx.db, ctx.userId, input.id);
      return { version: version.version, versionId: version.id };
    }),

  /** The public registry: published packages the user doesn't own, newest
   * adoptable version each. Verified (official) first. */
  browse: protectedProcedure.query(async ({ ctx }) => {
    const published = await ctx.db
      .selectDistinctOn([parserVersions.configId], {
        configId: parserVersions.configId,
        version: parserVersions.version,
        config: parserVersions.config,
      })
      .from(parserVersions)
      .innerJoin(parserConfigs, eq(parserConfigs.id, parserVersions.configId))
      .where(ne(parserConfigs.ownerId, ctx.userId))
      .orderBy(parserVersions.configId, desc(parserVersions.version));

    const verifiedRows = await ctx.db.query.parserConfigs.findMany({
      where: eq(parserConfigs.verified, true),
      columns: { id: true },
    });
    const verified = new Set(verifiedRows.map((r) => r.id));

    return published
      .map((p) => {
        const c = p.config as ParserConfig;
        return {
          configId: p.configId,
          version: p.version,
          slug: c.slug,
          displayName: c.vendor.displayName,
          vendorSlug: c.vendor.slug,
          category: c.vendor.category,
          verified: verified.has(p.configId),
        };
      })
      .sort(
        (a, b) =>
          Number(b.verified) - Number(a.verified) ||
          a.displayName.localeCompare(b.displayName),
      );
  }),

  /** Adopt a published package (default: its latest version) so it joins this
   * user's detection set. Reparse afterward to apply it to existing bills. */
  adopt: protectedProcedure
    .input(
      z.object({
        configId: z.string().uuid(),
        versionId: z.string().uuid().optional(),
      }),
    )
    .mutation(({ ctx, input }) =>
      adoptPackage(ctx.db, ctx.userId, input.configId, input.versionId),
    ),

  unadopt: protectedProcedure
    .input(z.object({ configId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await unadoptPackage(ctx.db, ctx.userId, input.configId);
      return { ok: true };
    }),

  /** Builder step 0: drop a bill, see which of the user's parsers (own +
   * adopted) claims it and what it extracts. Returns the normalized text so the
   * builder can show it. */
  detect: protectedProcedure
    .input(z.object({ rawText: z.string().min(20).max(RAW_TEXT_MAX) }))
    .mutation(async ({ ctx, input }) => {
      const text = normalize(input.rawText);
      const configs = await loadUserConfigs(ctx.db, ctx.userId);
      const config = selectConfig(configs, text);

      if (!config) {
        return { text, match: null, result: null, error: null };
      }
      const match = {
        slug: config.slug,
        version: config.version,
        displayName: config.vendor.displayName,
        vendorSlug: config.vendor.slug,
        category: config.vendor.category,
      };
      let result = null;
      let error: string | null = null;
      try {
        result = runConfig(config, text);
      } catch (err) {
        error = err instanceof ParseError ? err.message : String(err);
      }
      return { text, match, result, error };
    }),

  /** Builder step 1+2: run a draft (possibly unsaved) config against a bill.
   * Reports whether detection matched and what extraction produced — the live
   * preview / "test against a new bill" backend. */
  test: protectedProcedure
    .input(configInputSchema.extend({ rawText: z.string().min(20).max(RAW_TEXT_MAX) }))
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
        where: eq(bills.createdBy, ctx.userId),
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
        .where(and(eq(bills.createdBy, ctx.userId), eq(bills.parserKey, input.slug)));
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
        rawText: z.string().min(20).max(RAW_TEXT_MAX),
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

  /** Re-run detection across the user's parsers and report load/compile health.
   * Useful for the builder's preset list. */
  configs: protectedProcedure.query(async ({ ctx }) => {
    const configs = await loadUserConfigs(ctx.db, ctx.userId);
    return configs.map((c) => ({ slug: c.slug, version: c.version }));
  }),
});

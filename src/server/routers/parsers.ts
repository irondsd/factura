import { TRPCError } from "@trpc/server";
import { and, asc, count, desc, eq, inArray, isNull, ne, or } from "drizzle-orm";
import { z } from "zod";
import {
  bills,
  parserAdoptions,
  parserConfigs,
  parserSamples,
  parserVersions,
  parserVotes,
} from "@/db/schema";
import {
  detectScore,
  runConfig,
  selectConfig,
} from "@/parsers/engine/evaluate";
import { ParseError, type ParserConfig } from "@/parsers/engine/types";
import { normalize } from "@/parsers/normalize";
import { fieldsOf, rowToConfig } from "../parsers";
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

/** Published-not-owned filter for the registry: a user doesn't own a package
 * when it's ownerless (official) or owned by someone else. */
const notOwnedBy = (userId: string) =>
  or(isNull(parserConfigs.ownerId), ne(parserConfigs.ownerId, userId));
import { evaluateCandidates } from "../suggest/evaluate-in-worker";
import type { SuggestCandidate } from "../suggest/protocol";
import { rankSuggestions, type Suggestion } from "../suggest/rank";
import { protectedProcedure, router, scopedProcedure } from "../trpc";

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
        // The source package row carries the catalog metadata (category etc.),
        // which lives in columns rather than the engine config — pull it so a
        // fork can prefill it in the builder.
        const src = await ctx.db.query.parserConfigs.findFirst({
          where: eq(parserConfigs.id, a.configId),
        });
        return {
          id: a.configId,
          slug: c.slug,
          version: c.version,
          vendorSlug: c.vendor.slug,
          displayName: c.vendor.displayName,
          body: c,
          category: src?.category ?? null,
          region: src?.region ?? null,
          provider: src?.provider ?? null,
          compat: src?.compat ?? null,
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
      // Readable only if you own it, it's official, or you've adopted it —
      // otherwise another user's private draft would leak.
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      if (row.ownerId !== ctx.userId && row.tier !== "official") {
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
            body: input.definition,
            category: input.category ?? null,
            region: input.region ?? null,
            provider: input.provider ?? null,
            compat: input.compat ?? null,
            forkedFrom: input.forkedFrom ?? null,
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
          body: input.definition,
          category: input.category ?? null,
          region: input.region ?? null,
          provider: input.provider ?? null,
          compat: input.compat ?? null,
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
    .input(
      z.object({ id: z.string().uuid(), note: z.string().max(200).optional() }),
    )
    .mutation(async ({ ctx, input }) => {
      const version = await publishPackage(
        ctx.db,
        ctx.userId,
        input.id,
        input.note,
      );
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
      .where(notOwnedBy(ctx.userId))
      .orderBy(parserVersions.configId, desc(parserVersions.version));

    const officialRows = await ctx.db.query.parserConfigs.findMany({
      where: eq(parserConfigs.tier, "official"),
      columns: { id: true },
    });
    const official = new Set(officialRows.map((r) => r.id));

    return published
      .map((p) => {
        const c = p.config as ParserConfig;
        return {
          configId: p.configId,
          version: p.version,
          slug: c.slug,
          displayName: c.vendor.displayName,
          vendorSlug: c.vendor.slug,
          verified: official.has(p.configId),
        };
      })
      .sort(
        (a, b) =>
          Number(b.verified) - Number(a.verified) ||
          a.displayName.localeCompare(b.displayName),
      );
  }),

  /** Registry-assisted recovery for an unrecognized bill: which PUBLISHED
   * parsers (not owned, not yet adopted) recognize THIS bill, and what each
   * extracts from it — so the user can eyeball correctness and adopt the right
   * one. The detection/extraction runs untrusted regex, so it happens in a
   * worker with a hard deadline (evaluateCandidates); nothing is written and no
   * un-adopted parser ever touches a stored bill. */
  suggestForBill: scopedProcedure
    .input(z.object({ billId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const ids = ctx.accessiblePropertyIds;
      const bill = await ctx.db.query.bills.findFirst({
        where: eq(bills.id, input.billId),
      });
      if (!bill) throw new TRPCError({ code: "NOT_FOUND" });
      // Same access rule as the bills router: a filed bill is gated by property,
      // an inbox bill by uploader.
      const allowed = bill.propertyId
        ? ids.includes(bill.propertyId)
        : bill.createdBy === ctx.userId;
      if (!allowed) throw new TRPCError({ code: "NOT_FOUND" });

      const text = normalize(bill.rawText);

      // Latest published version per config the user doesn't own.
      const published = await ctx.db
        .selectDistinctOn([parserVersions.configId], {
          configId: parserVersions.configId,
          versionId: parserVersions.id,
          config: parserVersions.config,
        })
        .from(parserVersions)
        .innerJoin(parserConfigs, eq(parserConfigs.id, parserVersions.configId))
        .where(notOwnedBy(ctx.userId))
        .orderBy(parserVersions.configId, desc(parserVersions.version));

      // Drop the ones already adopted — those already run in the user's set, so
      // if they recognized the bill it wouldn't be unrecognized.
      const adoptions = await ctx.db.query.parserAdoptions.findMany({
        where: eq(parserAdoptions.userId, ctx.userId),
      });
      const adopted = new Set(adoptions.map((a) => a.configId));

      const officialRows = await ctx.db.query.parserConfigs.findMany({
        where: eq(parserConfigs.tier, "official"),
        columns: { id: true },
      });
      const verified = new Set(officialRows.map((r) => r.id));

      const adoptCounts = await ctx.db
        .select({ configId: parserAdoptions.configId, n: count() })
        .from(parserAdoptions)
        .groupBy(parserAdoptions.configId);
      const countByConfig = new Map(adoptCounts.map((c) => [c.configId, c.n]));

      // Verified/popular first, so a squatter's slow regex can't starve real
      // suggestions within the worker's time budget.
      const metas = published
        .filter((p) => !adopted.has(p.configId))
        .map((p) => {
          const c = p.config as ParserConfig;
          return {
            token: p.configId,
            config: c,
            configId: p.configId,
            versionId: p.versionId,
            slug: c.slug,
            displayName: c.vendor.displayName,
            vendorSlug: c.vendor.slug,
            verified: verified.has(p.configId),
            adoptionCount: countByConfig.get(p.configId) ?? 0,
            customDefs: (c.custom ?? []).map((f) => ({
              name: f.name,
              unit: f.unit ?? null,
              type: f.type,
            })),
          };
        })
        .sort(
          (a, b) =>
            Number(b.verified) - Number(a.verified) ||
            b.adoptionCount - a.adoptionCount,
        );

      if (metas.length === 0) return [] as Suggestion[];

      const candidates: SuggestCandidate[] = metas.map((m) => ({
        token: m.token,
        config: m.config,
      }));
      const evaluated = await evaluateCandidates(text, candidates);

      const suggestions: Suggestion[] = [];
      for (const m of metas) {
        const r = evaluated.get(m.token);
        if (!r) continue; // didn't detect the bill (or timed out) — not a fit
        suggestions.push({
          configId: m.configId,
          versionId: m.versionId,
          slug: m.slug,
          displayName: m.displayName,
          vendorSlug: m.vendorSlug,
          verified: m.verified,
          adoptionCount: m.adoptionCount,
          customDefs: m.customDefs,
          ok: r.result !== null,
          error: r.error,
          result: r.result,
          score: r.score,
        });
      }
      return rankSuggestions(suggestions);
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

  /** The whole parser-library page in one shot: every package the user can see —
   * their own drafts, the official/community packages they've adopted, and the
   * rest of the published registry — each annotated with catalog metadata, its
   * relationship to the user (owned / adopted / browsing), adoption + vote
   * counts, and its published version history. Replaces the separate
   * list/browse/active reads the old page stitched together. */
  library: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.userId;

    // Own drafts (editable) + the published registry the user doesn't own.
    const ownRows = await ctx.db.query.parserConfigs.findMany({
      where: eq(parserConfigs.ownerId, userId),
    });
    const publishedIds = await ctx.db
      .selectDistinct({ configId: parserVersions.configId })
      .from(parserVersions)
      .innerJoin(parserConfigs, eq(parserConfigs.id, parserVersions.configId))
      .where(notOwnedBy(userId));
    const marketRows = publishedIds.length
      ? await ctx.db.query.parserConfigs.findMany({
          where: inArray(
            parserConfigs.id,
            publishedIds.map((r) => r.configId),
          ),
        })
      : [];

    const rows = [...ownRows, ...marketRows];
    const ids = rows.map((r) => r.id);
    if (ids.length === 0) return [];

    // Every published version of every visible package (history + selector).
    const versionRows = await ctx.db.query.parserVersions.findMany({
      where: inArray(parserVersions.configId, ids),
      orderBy: [desc(parserVersions.version)],
    });
    const versionsByConfig = new Map<string, typeof versionRows>();
    for (const v of versionRows) {
      const list = versionsByConfig.get(v.configId) ?? [];
      list.push(v);
      versionsByConfig.set(v.configId, list);
    }

    // Which version (if any) the user runs for each package.
    const adoptions = await ctx.db.query.parserAdoptions.findMany({
      where: eq(parserAdoptions.userId, userId),
    });
    const adoptedVersionId = new Map(adoptions.map((a) => [a.configId, a.versionId]));

    // Adoption counts (popularity) and vote tallies.
    const adoptCounts = await ctx.db
      .select({ configId: parserAdoptions.configId, n: count() })
      .from(parserAdoptions)
      .where(inArray(parserAdoptions.configId, ids))
      .groupBy(parserAdoptions.configId);
    const adoptionsByConfig = new Map(adoptCounts.map((c) => [c.configId, c.n]));

    const votes = await ctx.db.query.parserVotes.findMany({
      where: inArray(parserVotes.configId, ids),
    });
    const voteTally = new Map<string, { up: number; down: number; mine: number }>();
    for (const v of votes) {
      const t = voteTally.get(v.configId) ?? { up: 0, down: 0, mine: 0 };
      if (v.value > 0) t.up += 1;
      else if (v.value < 0) t.down += 1;
      if (v.userId === userId) t.mine = v.value;
      voteTally.set(v.configId, t);
    }

    return rows.map((r) => {
      const owned = r.ownerId === userId;
      const versions = (versionsByConfig.get(r.id) ?? []).map((v) => ({
        versionId: v.id,
        version: v.version,
        note: v.note,
        publishedAt: v.publishedAt.toISOString(),
        fields: fieldsOf(v.config as ParserConfig),
      }));
      // Own drafts with nothing published yet still need a row to display.
      if (owned && versions.length === 0) {
        versions.push({
          versionId: null as unknown as string,
          version: Number(r.version),
          note: null,
          publishedAt: r.updatedAt.toISOString(),
          fields: fieldsOf(rowToConfig(r)),
        });
      }
      const stable = versions.reduce((m, v) => Math.max(m, v.version), 0);
      const adoptedVid = adoptedVersionId.get(r.id);
      const adoptedVersion = adoptedVid
        ? (versions.find((v) => v.versionId === adoptedVid)?.version ?? null)
        : null;
      const rel = owned ? "owned" : adoptedVid ? "adopted" : null;
      const tally = voteTally.get(r.id) ?? { up: 0, down: 0, mine: 0 };
      // "published" = the current draft is frozen as a version; otherwise the
      // owner has unpublished changes (or never published).
      const ownerStatus = owned
        ? stable >= Number(r.version)
          ? "published"
          : "unpublished"
        : null;
      const lastUpdated = owned
        ? r.updatedAt.toISOString()
        : (versions[0]?.publishedAt ?? r.updatedAt.toISOString());

      return {
        configId: r.id,
        slug: r.slug,
        name: r.displayName,
        vendorSlug: r.vendorSlug,
        provider: r.provider,
        category: r.category,
        region: r.region,
        compat: r.compat,
        tier: r.tier,
        forkedFrom: r.forkedFrom,
        rel,
        ownerStatus,
        adoptions: adoptionsByConfig.get(r.id) ?? 0,
        up: tally.up,
        down: tally.down,
        myVote: tally.mine,
        adoptedVersion,
        stable,
        lastUpdated,
        versions,
      };
    });
  }),

  /** Cast, change, or clear the current user's vote on a published package.
   * `dir` 0 clears; +1/-1 up/downvote. Idempotent. */
  vote: protectedProcedure
    .input(
      z.object({
        configId: z.string().uuid(),
        dir: z.union([z.literal(-1), z.literal(0), z.literal(1)]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.dir === 0) {
        await ctx.db
          .delete(parserVotes)
          .where(
            and(
              eq(parserVotes.userId, ctx.userId),
              eq(parserVotes.configId, input.configId),
            ),
          );
        return { value: 0 };
      }
      await ctx.db
        .insert(parserVotes)
        .values({
          userId: ctx.userId,
          configId: input.configId,
          value: input.dir,
        })
        .onConflictDoUpdate({
          target: [parserVotes.userId, parserVotes.configId],
          set: { value: input.dir },
        });
      return { value: input.dir };
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
    .input(
      configInputSchema.extend({
        rawText: z.string().min(20).max(RAW_TEXT_MAX),
      }),
    )
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
    .input(
      z.object({ detect: detectSchema, excludeSlug: z.string().optional() }),
    )
    .query(async ({ ctx, input }) => {
      const probe = { detect: input.detect } as ParserConfig;
      const userBills = await ctx.db.query.bills.findMany({
        where: eq(bills.createdBy, ctx.userId),
        orderBy: [desc(bills.createdAt)],
      });
      const collisions: {
        id: string;
        fileName: string | null;
        parserKey: string | null;
      }[] = [];
      for (const b of userBills) {
        // Only bills already claimed by a *different* parser are conflicts.
        // Unrecognized bills (no parserKey) — including the one being built
        // from — are valid targets, not collisions.
        if (!b.parserKey || b.parserKey === input.excludeSlug) continue;
        if (detectScore(probe, normalize(b.rawText)) !== null) {
          collisions.push({
            id: b.id,
            fileName: b.fileName,
            parserKey: b.parserKey,
          });
        }
      }
      return collisions;
    }),

  /** Builder autoload: the newest of the user's own bills whose text this
   * candidate detection recognizes — so opening a parser to fork/edit prefills a
   * bill or two the parser actually fits, instead of an empty drop zone. Returns
   * normalized text so the builder can seed directly. Own-bills only, mirroring
   * `detectCollisions` — no cross-user data is read. */
  matchingBills: protectedProcedure
    .input(
      z.object({
        detect: detectSchema,
        limit: z.number().int().min(1).max(5).default(3),
      }),
    )
    .query(async ({ ctx, input }) => {
      const probe = { detect: input.detect } as ParserConfig;
      const userBills = await ctx.db.query.bills.findMany({
        where: eq(bills.createdBy, ctx.userId),
        orderBy: [desc(bills.createdAt)],
      });
      const matches: { id: string; fileName: string | null; text: string }[] =
        [];
      for (const b of userBills) {
        const text = normalize(b.rawText);
        if (detectScore(probe, text) !== null) {
          matches.push({ id: b.id, fileName: b.fileName, text });
          if (matches.length >= input.limit) break;
        }
      }
      return matches;
    }),

  /** How many of the user's bills currently use a preset — shown before save so
   * the reparse is explicit ("saving will re-run against N bills"). */
  usage: protectedProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ ctx, input }) => {
      const [row] = await ctx.db
        .select({ n: count() })
        .from(bills)
        .where(
          and(eq(bills.createdBy, ctx.userId), eq(bills.parserKey, input.slug)),
        );
      return { count: row?.n ?? 0 };
    }),

  /** Which parser actually wins for the user's bills, per vendor slug. Mirrors
   * the detection merge (own package shadows an adopted one of the same slug)
   * and annotates each entry with how many of the user's bills currently carry
   * that slug — drives the "active parsers" panel + its reparse button. Also
   * surfaces orphan slugs: bills last parsed by a slug the user no longer runs
   * (those won't reparse until a matching parser is adopted/forked). */
  active: protectedProcedure.query(async ({ ctx }) => {
    const ownRows = await ctx.db.query.parserConfigs.findMany({
      where: eq(parserConfigs.ownerId, ctx.userId),
    });
    const adoptions = await ctx.db.query.parserAdoptions.findMany({
      where: eq(parserAdoptions.userId, ctx.userId),
    });
    const versionIds = adoptions.map((a) => a.versionId);
    const versionRows = versionIds.length
      ? await ctx.db.query.parserVersions.findMany({
          where: inArray(parserVersions.id, versionIds),
        })
      : [];
    const officialRows = await ctx.db.query.parserConfigs.findMany({
      where: eq(parserConfigs.tier, "official"),
      columns: { id: true },
    });
    const verified = new Set(officialRows.map((r) => r.id));

    type Entry = {
      slug: string;
      displayName: string;
      vendorSlug: string;
      source: "own" | "official" | "community" | "none";
      version: number;
      // An own parser that overrides an adopted one of the same slug.
      shadowsAdopted: boolean;
    };
    const bySlug = new Map<string, Entry>();

    // Adopted first; an own package of the same slug overwrites it below.
    for (const a of adoptions) {
      const v = versionRows.find((r) => r.id === a.versionId);
      if (!v) continue;
      const c = v.config as ParserConfig;
      bySlug.set(c.slug, {
        slug: c.slug,
        displayName: c.vendor.displayName,
        vendorSlug: c.vendor.slug,
        source: verified.has(a.configId) ? "official" : "community",
        version: c.version,
        shadowsAdopted: false,
      });
    }
    for (const r of ownRows) {
      bySlug.set(r.slug, {
        slug: r.slug,
        displayName: r.displayName,
        vendorSlug: r.vendorSlug,
        source: "own",
        version: Number(r.version),
        shadowsAdopted: bySlug.has(r.slug),
      });
    }

    // Bills per parserKey for this user.
    const counts = await ctx.db
      .select({ slug: bills.parserKey, n: count() })
      .from(bills)
      .where(eq(bills.createdBy, ctx.userId))
      .groupBy(bills.parserKey);
    const countBySlug = new Map(counts.map((c) => [c.slug, c.n] as const));

    const result = [...bySlug.values()].map((e) => ({
      ...e,
      billCount: countBySlug.get(e.slug) ?? 0,
    }));

    // Orphans: bills carry a slug no active parser provides.
    for (const c of counts) {
      if (!c.slug || bySlug.has(c.slug)) continue;
      result.push({
        slug: c.slug,
        displayName: c.slug,
        vendorSlug: c.slug,
        source: "none",
        version: 0,
        shadowsAdopted: false,
        billCount: c.n,
      });
    }

    return result.sort(
      (a, b) =>
        b.billCount - a.billCount || a.displayName.localeCompare(b.displayName),
    );
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

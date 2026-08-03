import { and, count, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import {
  bills,
  parserConfigs,
  parserVersions,
  properties,
  propertyMembers,
  users,
} from "@/db/schema";
import {
  deleteBills,
  deleteParsers,
  deleteProperties,
  deleteStoredFiles,
  deleteUserRecord,
  disposition,
  handOverProperties,
} from "../account";
import { protectedProcedure, router } from "../trpc";

/** Permanent account deletion. `summary` is what the confirmation screen reads;
 * the mutations are the run itself, called in listed order by the delete page so
 * the user sees each stage happen. See src/server/account.ts for why the steps
 * carry no plan between them. */
export const accountRouter = router({
  /** Everything the confirmation screen needs to tell the truth about what is
   * about to happen: the totals, the per-property fate (including the ones the
   * user has to decide on), and which parsers outlive the account. */
  summary: protectedProcedure.query(async ({ ctx }) => {
    const me = await ctx.db.query.users.findFirst({
      where: eq(users.id, ctx.userId),
      columns: { email: true, name: true, createdAt: true },
    });

    const mine = await ctx.db.query.propertyMembers.findMany({
      where: eq(propertyMembers.userId, ctx.userId),
    });
    const ids = mine.map((m) => m.propertyId);

    const [propertyRows, memberRows] = await Promise.all([
      ids.length
        ? ctx.db.query.properties.findMany({
            where: inArray(properties.id, ids),
          })
        : Promise.resolve([]),
      ids.length
        ? ctx.db.query.propertyMembers.findMany({
            where: inArray(propertyMembers.propertyId, ids),
          })
        : Promise.resolve([]),
    ]);

    const peopleIds = [...new Set(memberRows.map((m) => m.userId))];
    const people = peopleIds.length
      ? await ctx.db.query.users.findMany({
          where: inArray(users.id, peopleIds),
          columns: { id: true, name: true, email: true },
        })
      : [];
    const personById = new Map(people.map((p) => [p.id, p]));

    // Bill and stored-file tallies per property, plus the unfiled inbox — which
    // is scoped to the uploader, since it belongs to no property.
    const inboxScope = and(
      isNull(bills.propertyId),
      eq(bills.createdBy, ctx.userId),
    )!;
    const tallies = await ctx.db
      .select({
        propertyId: bills.propertyId,
        total: count(),
        files: count(bills.storageKey),
        mine: sql<number>`count(*) filter (where ${bills.createdBy} = ${ctx.userId})`.mapWith(
          Number,
        ),
      })
      .from(bills)
      .where(
        ids.length
          ? or(inArray(bills.propertyId, ids), inboxScope)!
          : inboxScope,
      )
      .groupBy(bills.propertyId);
    const tallyFor = (propertyId: string | null) =>
      tallies.find((t) => t.propertyId === propertyId) ?? {
        total: 0,
        files: 0,
        mine: 0,
      };

    const propertyList = propertyRows.map((p) => {
      const others = memberRows.filter(
        (m) => m.propertyId === p.id && m.userId !== ctx.userId,
      );
      const tally = tallyFor(p.id);
      return {
        id: p.id,
        nickname: p.nickname,
        role: mine.find((m) => m.propertyId === p.id)?.role ?? "member",
        fate: disposition({
          otherOwners: others.filter((m) => m.role === "owner").length,
          otherMembers: others.length,
        }),
        bills: tally.total,
        files: tally.files,
        myBills: tally.mine,
        members: others.map((m) => ({
          userId: m.userId,
          role: m.role,
          name: personById.get(m.userId)?.name ?? null,
          email: personById.get(m.userId)?.email ?? "",
        })),
      };
    });

    // Own packages, split by whether anything of theirs was ever published.
    const own = await ctx.db.query.parserConfigs.findMany({
      where: eq(parserConfigs.ownerId, ctx.userId),
      columns: { id: true, displayName: true, slug: true },
    });
    const publishedRows = own.length
      ? await ctx.db
          .selectDistinct({ configId: parserVersions.configId })
          .from(parserVersions)
          .where(
            inArray(
              parserVersions.configId,
              own.map((r) => r.id),
            ),
          )
      : [];
    const published = new Set(publishedRows.map((r) => r.configId));

    const inbox = tallyFor(null);
    return {
      email: me?.email ?? "",
      name: me?.name ?? null,
      memberSince: me?.createdAt.toISOString() ?? null,
      inbox: { bills: inbox.total, files: inbox.files },
      properties: propertyList,
      parsers: {
        kept: own.filter((r) => published.has(r.id)).map((r) => r.displayName),
        removed: own
          .filter((r) => !published.has(r.id))
          .map((r) => r.displayName),
      },
    };
  }),

  /** Step 1 — settle the properties that outlive the account: hand each one to
   * a member or drop the membership. Every later step refuses to run until this
   * one has. */
  handOver: protectedProcedure
    .input(
      z.object({
        decisions: z
          .array(
            z.discriminatedUnion("action", [
              z.object({
                propertyId: z.string().uuid(),
                action: z.literal("delete"),
              }),
              z.object({
                propertyId: z.string().uuid(),
                action: z.literal("handover"),
                toUserId: z.string().uuid(),
              }),
            ]),
          )
          .default([]),
      }),
    )
    .mutation(({ ctx, input }) =>
      handOverProperties(ctx.db, ctx.userId, input.decisions),
    ),

  /** Step 2 — the original PDFs in object storage. */
  deleteFiles: protectedProcedure.mutation(({ ctx }) =>
    deleteStoredFiles(ctx.db, ctx.userId),
  ),

  /** Step 3 — the bills and the public submissions they were claimed from. */
  deleteBills: protectedProcedure.mutation(({ ctx }) =>
    deleteBills(ctx.db, ctx.userId),
  ),

  /** Step 4 — the properties, with their vendors, accounts and forecasts. */
  deleteProperties: protectedProcedure.mutation(({ ctx }) =>
    deleteProperties(ctx.db, ctx.userId),
  ),

  /** Step 5 — the parsers: published ones orphaned, drafts deleted. */
  deleteParsers: protectedProcedure.mutation(({ ctx }) =>
    deleteParsers(ctx.db, ctx.userId),
  ),

  /** Step 6 — the account record, its sign-in identities and every session but
   * the cookie in the caller's browser, which is dead the moment this returns. */
  finalize: protectedProcedure.mutation(({ ctx }) =>
    deleteUserRecord(ctx.db, ctx.userId),
  ),
});

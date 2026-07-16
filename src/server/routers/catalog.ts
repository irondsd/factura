import { TRPCError } from "@trpc/server";
import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import {
  bills,
  properties,
  propertyInvites,
  propertyMembers,
  users,
  vendorAccounts,
  vendors,
} from "@/db/schema";
import { VENDOR_COLOR_NAMES } from "@/lib/vendorColors";
import { createPropertyForUser } from "../defaults";
import { sendShareInviteEmail } from "../email";
import { deleteObject, isStorageConfigured } from "../storage";
import {
  assertMember,
  assertMemberVendor,
  OWNED_PROPERTY_LIMIT,
  scopeIds,
} from "../ownership";
import { protectedProcedure, router, scopedProcedure } from "../trpc";

export const propertiesRouter = router({
  /** Every property the user can access (owned + shared), each with the
   * caller's role, its members, and pending invites. Drives both the header
   * switcher (uses id/nickname) and the properties page. */
  list: protectedProcedure.query(async ({ ctx }) => {
    const mine = await ctx.db.query.propertyMembers.findMany({
      where: eq(propertyMembers.userId, ctx.userId),
    });
    const ids = mine.map((m) => m.propertyId);
    if (ids.length === 0) return [];
    const roleByProperty = new Map(mine.map((m) => [m.propertyId, m.role]));

    const [props, members, invites] = await Promise.all([
      ctx.db.query.properties.findMany({
        where: inArray(properties.id, ids),
        orderBy: [asc(properties.createdAt)],
      }),
      ctx.db.query.propertyMembers.findMany({
        where: inArray(propertyMembers.propertyId, ids),
      }),
      ctx.db.query.propertyInvites.findMany({
        where: inArray(propertyInvites.propertyId, ids),
      }),
    ]);

    const memberUserIds = [...new Set(members.map((m) => m.userId))];
    const userRows = memberUserIds.length
      ? await ctx.db.query.users.findMany({
          where: inArray(users.id, memberUserIds),
          columns: { id: true, name: true, email: true },
        })
      : [];
    const userById = new Map(userRows.map((u) => [u.id, u]));

    return props.map((p) => ({
      id: p.id,
      nickname: p.nickname,
      address: p.address,
      role: roleByProperty.get(p.id) ?? "member",
      members: members
        .filter((m) => m.propertyId === p.id)
        .map((m) => ({
          userId: m.userId,
          role: m.role,
          name: userById.get(m.userId)?.name ?? null,
          email: userById.get(m.userId)?.email ?? "",
        })),
      invites: invites
        .filter((i) => i.propertyId === p.id)
        .map((i) => ({ id: i.id, email: i.email })),
    }));
  }),

  create: protectedProcedure
    .input(
      z.object({
        nickname: z.string().min(1).max(40),
        address: z.string().max(200).default(""),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const owned = await ctx.db.query.propertyMembers.findMany({
        where: and(
          eq(propertyMembers.userId, ctx.userId),
          eq(propertyMembers.role, "owner"),
        ),
        columns: { propertyId: true },
      });
      if (owned.length >= OWNED_PROPERTY_LIMIT)
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `You can own at most ${OWNED_PROPERTY_LIMIT} properties`,
        });
      return createPropertyForUser(
        ctx.db,
        ctx.userId,
        input.nickname,
        input.address,
      );
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        nickname: z.string().min(1).max(40).optional(),
        address: z.string().max(200).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertMember(ctx.db, ctx.userId, input.id, "owner");
      const { id, ...rest } = input;
      const [updated] = await ctx.db
        .update(properties)
        .set(rest)
        .where(eq(properties.id, id))
        .returning();
      return updated;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await assertMember(ctx.db, ctx.userId, input.id, "owner");

      // None of bills/accounts/vendors cascade from `properties` at the DB
      // level, so removing a property means tearing its contents down by hand,
      // in FK-safe order, inside one transaction. Members and invites *do*
      // cascade on the final property delete.
      const deletedBills = await ctx.db.transaction(async (tx) => {
        const removed = await tx
          .delete(bills)
          .where(eq(bills.propertyId, input.id))
          .returning({ storageKey: bills.storageKey });
        await tx
          .delete(vendorAccounts)
          .where(eq(vendorAccounts.propertyId, input.id));
        await tx.delete(vendors).where(eq(vendors.propertyId, input.id));
        await tx.delete(properties).where(eq(properties.id, input.id));
        return removed;
      });

      const storageKeys = deletedBills
        .map((b) => b.storageKey)
        .filter((k): k is string => !!k);

      // Best-effort cleanup of stored PDFs after the rows are gone. The DB is
      // the source of truth; a storage hiccup orphans an object but mustn't
      // resurrect a half-deleted property.
      if (isStorageConfigured()) {
        for (const key of storageKeys) {
          try {
            await deleteObject(key);
          } catch {
            // leave the orphan; nothing else to do
          }
        }
      }

      return { ok: true };
    }),

  /** Owner invites someone by email; claimed on their next sign-in. */
  invite: protectedProcedure
    .input(
      z.object({
        propertyId: z.string().uuid(),
        email: z.string().email().max(200),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertMember(ctx.db, ctx.userId, input.propertyId, "owner");
      const email = input.email.trim().toLowerCase();

      const me = await ctx.db.query.users.findFirst({
        where: eq(users.id, ctx.userId),
        columns: { email: true, name: true },
      });
      if (me?.email?.toLowerCase() === email)
        throw new TRPCError({ code: "BAD_REQUEST", message: "That's you" });

      // Already a member? (look the email up among existing accounts)
      const existingUser = await ctx.db.query.users.findFirst({
        where: eq(users.email, email),
        columns: { id: true },
      });
      if (existingUser) {
        const member = await ctx.db.query.propertyMembers.findFirst({
          where: and(
            eq(propertyMembers.propertyId, input.propertyId),
            eq(propertyMembers.userId, existingUser.id),
          ),
        });
        if (member)
          throw new TRPCError({
            code: "CONFLICT",
            message: "Already a member of this property",
          });
      }

      await ctx.db
        .insert(propertyInvites)
        .values({ propertyId: input.propertyId, email, invitedBy: ctx.userId })
        .onConflictDoNothing();

      // Notify the invitee. Best-effort — never blocks/fails the invite, which
      // is claimed on their next sign-in regardless.
      const property = await ctx.db.query.properties.findFirst({
        where: eq(properties.id, input.propertyId),
        columns: { nickname: true, address: true },
      });
      await sendShareInviteEmail({
        to: email,
        inviter: me?.name?.trim() || me?.email || "Someone",
        // The address is more recognizable to an invitee than a short nickname
        // ("Home"); fall back to the nickname when no address is set.
        property: property?.address || property?.nickname || "a property",
      });
      return { ok: true };
    }),

  revokeInvite: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const invite = await ctx.db.query.propertyInvites.findFirst({
        where: eq(propertyInvites.id, input.id),
      });
      if (!invite) throw new TRPCError({ code: "NOT_FOUND" });
      await assertMember(ctx.db, ctx.userId, invite.propertyId, "owner");
      await ctx.db
        .delete(propertyInvites)
        .where(eq(propertyInvites.id, input.id));
      return { ok: true };
    }),

  removeMember: protectedProcedure
    .input(
      z.object({ propertyId: z.string().uuid(), userId: z.string().uuid() }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertMember(ctx.db, ctx.userId, input.propertyId, "owner");
      if (input.userId === ctx.userId)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Use Leave to remove yourself",
        });
      await assertLeavesAnOwner(ctx.db, input.propertyId, input.userId);
      await ctx.db
        .delete(propertyMembers)
        .where(
          and(
            eq(propertyMembers.propertyId, input.propertyId),
            eq(propertyMembers.userId, input.userId),
          ),
        );
      return { ok: true };
    }),

  /** A member removes their own access. The last owner can't leave (they must
   * delete the property or, in a future version, transfer ownership). */
  leave: protectedProcedure
    .input(z.object({ propertyId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await assertMember(ctx.db, ctx.userId, input.propertyId);
      await assertLeavesAnOwner(ctx.db, input.propertyId, ctx.userId);
      await ctx.db
        .delete(propertyMembers)
        .where(
          and(
            eq(propertyMembers.propertyId, input.propertyId),
            eq(propertyMembers.userId, ctx.userId),
          ),
        );
      return { ok: true };
    }),

  /** Invitations addressed to the caller's email, awaiting accept/decline.
   * Invites are no longer auto-claimed on sign-in — the user decides here. */
  pendingInvites: protectedProcedure.query(async ({ ctx }) => {
    const me = await ctx.db.query.users.findFirst({
      where: eq(users.id, ctx.userId),
      columns: { email: true },
    });
    const email = me?.email?.toLowerCase();
    if (!email) return [];

    const invites = await ctx.db.query.propertyInvites.findMany({
      where: eq(propertyInvites.email, email),
    });
    if (invites.length === 0) return [];

    const inviterIds = [
      ...new Set(
        invites.map((i) => i.invitedBy).filter((id): id is string => !!id),
      ),
    ];
    const [props, inviters] = await Promise.all([
      ctx.db.query.properties.findMany({
        where: inArray(
          properties.id,
          invites.map((i) => i.propertyId),
        ),
        columns: { id: true, nickname: true },
      }),
      inviterIds.length
        ? ctx.db.query.users.findMany({
            where: inArray(users.id, inviterIds),
            columns: { id: true, name: true, email: true },
          })
        : Promise.resolve([]),
    ]);
    const nicknameById = new Map(props.map((p) => [p.id, p.nickname]));
    const inviterById = new Map(inviters.map((u) => [u.id, u.name ?? u.email]));

    return invites.map((i) => ({
      id: i.id,
      role: i.role,
      property: nicknameById.get(i.propertyId) ?? "Property",
      inviter: (i.invitedBy && inviterById.get(i.invitedBy)) || "Someone",
    }));
  }),

  /** Caller accepts an invite addressed to them: become a member, drop the invite. */
  acceptInvite: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const invite = await assertOwnInvite(ctx.db, ctx.userId, input.id);
      await ctx.db
        .insert(propertyMembers)
        .values({
          propertyId: invite.propertyId,
          userId: ctx.userId,
          role: invite.role,
        })
        .onConflictDoNothing();
      await ctx.db
        .delete(propertyInvites)
        .where(eq(propertyInvites.id, invite.id));
      return { ok: true };
    }),

  /** Caller declines an invite addressed to them: drop it (re-invitable later). */
  declineInvite: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const invite = await assertOwnInvite(ctx.db, ctx.userId, input.id);
      await ctx.db
        .delete(propertyInvites)
        .where(eq(propertyInvites.id, invite.id));
      return { ok: true };
    }),
});

/** Throw if removing `userId` from `propertyId` would leave it with no owner. */
async function assertLeavesAnOwner(
  db: Parameters<typeof assertMember>[0],
  propertyId: string,
  userId: string,
) {
  const owners = await db.query.propertyMembers.findMany({
    where: and(
      eq(propertyMembers.propertyId, propertyId),
      eq(propertyMembers.role, "owner"),
    ),
    columns: { userId: true },
  });
  const isOwner = owners.some((o) => o.userId === userId);
  if (isOwner && owners.length === 1)
    throw new TRPCError({
      code: "CONFLICT",
      message: "You're the only owner — delete the property instead",
    });
}

/** Load an invite by id and assert it's addressed to this user's email. */
async function assertOwnInvite(
  db: Parameters<typeof assertMember>[0],
  userId: string,
  inviteId: string,
) {
  const invite = await db.query.propertyInvites.findFirst({
    where: eq(propertyInvites.id, inviteId),
  });
  if (!invite) throw new TRPCError({ code: "NOT_FOUND" });
  const me = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { email: true },
  });
  if (!me?.email || me.email.toLowerCase() !== invite.email.toLowerCase())
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "This invitation isn't addressed to you",
    });
  return invite;
}

export const vendorsRouter = router({
  list: scopedProcedure
    .input(z.object({ propertyId: z.string().uuid().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const scope = scopeIds(ctx.accessiblePropertyIds, input?.propertyId);
      if (scope.length === 0) return [];
      return ctx.db.query.vendors.findMany({
        where: inArray(vendors.propertyId, scope),
        orderBy: [asc(vendors.createdAt)],
      });
    }),

  update: protectedProcedure
    .input(
      z
        .object({
          id: z.string().uuid(),
          displayName: z.string().min(1).max(40).optional(),
          color: z.enum(VENDOR_COLOR_NAMES).optional(),
        })
        .refine((v) => v.displayName !== undefined || v.color !== undefined, {
          message: "Nothing to update",
        }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertMemberVendor(ctx.db, ctx.userId, input.id, "owner");
      const { id, ...rest } = input;
      const [updated] = await ctx.db
        .update(vendors)
        .set(rest)
        .where(eq(vendors.id, id))
        .returning();
      return updated;
    }),
});

export const accountsRouter = router({
  list: scopedProcedure
    .input(z.object({ propertyId: z.string().uuid().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const scope = scopeIds(ctx.accessiblePropertyIds, input?.propertyId);
      if (scope.length === 0) return [];
      return ctx.db.query.vendorAccounts.findMany({
        where: inArray(vendorAccounts.propertyId, scope),
        orderBy: [asc(vendorAccounts.createdAt)],
      });
    }),

  create: protectedProcedure
    .input(
      z.object({
        vendorId: z.string().uuid(),
        propertyId: z.string().uuid(),
        accountNumber: z.string().min(1),
        label: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertMember(ctx.db, ctx.userId, input.propertyId, "owner");
      // The vendor must live in the same property as the account.
      const vendor = await ctx.db.query.vendors.findFirst({
        where: and(
          eq(vendors.id, input.vendorId),
          eq(vendors.propertyId, input.propertyId),
        ),
        columns: { id: true },
      });
      if (!vendor)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Vendor does not belong to this property",
        });
      const [created] = await ctx.db
        .insert(vendorAccounts)
        .values(input)
        .returning();
      return created;
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        label: z.string().nullable().optional(),
        active: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const account = await ctx.db.query.vendorAccounts.findFirst({
        where: eq(vendorAccounts.id, input.id),
        columns: { propertyId: true },
      });
      if (!account) throw new TRPCError({ code: "NOT_FOUND" });
      await assertMember(ctx.db, ctx.userId, account.propertyId, "owner");
      const { id, ...rest } = input;
      const [updated] = await ctx.db
        .update(vendorAccounts)
        .set(rest)
        .where(eq(vendorAccounts.id, id))
        .returning();
      return updated;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const account = await ctx.db.query.vendorAccounts.findFirst({
        where: eq(vendorAccounts.id, input.id),
        columns: { propertyId: true },
      });
      if (!account) throw new TRPCError({ code: "NOT_FOUND" });
      await assertMember(ctx.db, ctx.userId, account.propertyId, "owner");
      try {
        await ctx.db
          .delete(vendorAccounts)
          .where(eq(vendorAccounts.id, input.id));
      } catch {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Account has linked bills",
        });
      }
      return { ok: true };
    }),
});

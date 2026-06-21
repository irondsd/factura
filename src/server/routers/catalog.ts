import { TRPCError } from "@trpc/server";
import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import {
  properties,
  propertyInvites,
  propertyMembers,
  users,
  vendorAccounts,
  vendors,
} from "@/db/schema";
import { VENDOR_COLOR_NAMES } from "@/lib/vendorColors";
import { createApartmentForUser } from "../defaults";
import {
  accessibleProperties,
  assertMember,
  assertMemberVendor,
  OWNED_APARTMENT_LIMIT,
} from "../ownership";
import { protectedProcedure, router } from "../trpc";

export const propertiesRouter = router({
  /** Every apartment the user can access (owned + shared), each with the
   * caller's role, its members, and pending invites. Drives both the header
   * switcher (uses id/nickname) and the apartments page. */
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
      addressVariants: p.addressVariants,
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
        addressVariants: z.array(z.string().min(4)).default([]),
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
      if (owned.length >= OWNED_APARTMENT_LIMIT)
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `You can own at most ${OWNED_APARTMENT_LIMIT} apartments`,
        });
      return createApartmentForUser(
        ctx.db,
        ctx.userId,
        input.nickname,
        input.addressVariants,
      );
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        nickname: z.string().min(1).max(40).optional(),
        addressVariants: z.array(z.string().min(4)).optional(),
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
      try {
        await ctx.db.delete(properties).where(eq(properties.id, input.id));
      } catch {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Apartment has linked accounts or bills",
        });
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
        columns: { email: true },
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
            message: "Already a member of this apartment",
          });
      }

      await ctx.db
        .insert(propertyInvites)
        .values({ propertyId: input.propertyId, email, invitedBy: ctx.userId })
        .onConflictDoNothing();
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
      await ctx.db.delete(propertyInvites).where(eq(propertyInvites.id, input.id));
      return { ok: true };
    }),

  removeMember: protectedProcedure
    .input(z.object({ propertyId: z.string().uuid(), userId: z.string().uuid() }))
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
   * delete the apartment or, in a future version, transfer ownership). */
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
      message: "You're the only owner — delete the apartment instead",
    });
}

export const vendorsRouter = router({
  list: protectedProcedure
    .input(z.object({ propertyId: z.string().uuid().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const ids = await accessibleProperties(ctx.db, ctx.userId);
      if (ids.length === 0) return [];
      const scope = input?.propertyId
        ? ids.includes(input.propertyId)
          ? [input.propertyId]
          : []
        : ids;
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
  list: protectedProcedure
    .input(z.object({ propertyId: z.string().uuid().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const ids = await accessibleProperties(ctx.db, ctx.userId);
      if (ids.length === 0) return [];
      const scope = input?.propertyId
        ? ids.includes(input.propertyId)
          ? [input.propertyId]
          : []
        : ids;
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
      // The vendor must live in the same apartment as the account.
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
          message: "Vendor does not belong to this apartment",
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
        await ctx.db.delete(vendorAccounts).where(eq(vendorAccounts.id, input.id));
      } catch {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Account has linked bills",
        });
      }
      return { ok: true };
    }),
});

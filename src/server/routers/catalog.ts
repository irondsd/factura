import { TRPCError } from "@trpc/server";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { properties, vendorAccounts, vendors } from "@/db/schema";
import { assertOwnsProperty, assertOwnsVendor } from "../ownership";
import { protectedProcedure, router } from "../trpc";

export const propertiesRouter = router({
  list: protectedProcedure.query(({ ctx }) =>
    ctx.db.query.properties.findMany({
      where: eq(properties.userId, ctx.userId),
      orderBy: [asc(properties.createdAt)],
    }),
  ),

  create: protectedProcedure
    .input(
      z.object({
        nickname: z.string().min(1).max(40),
        addressVariants: z.array(z.string().min(4)).default([]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [created] = await ctx.db
        .insert(properties)
        .values({ ...input, userId: ctx.userId })
        .returning();
      return created;
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
      const { id, ...rest } = input;
      const [updated] = await ctx.db
        .update(properties)
        .set(rest)
        .where(and(eq(properties.id, id), eq(properties.userId, ctx.userId)))
        .returning();
      if (!updated) throw new TRPCError({ code: "NOT_FOUND" });
      return updated;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      try {
        await ctx.db
          .delete(properties)
          .where(
            and(eq(properties.id, input.id), eq(properties.userId, ctx.userId)),
          );
      } catch {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Property has linked accounts or bills",
        });
      }
      return { ok: true };
    }),
});

export const vendorsRouter = router({
  list: protectedProcedure.query(({ ctx }) =>
    ctx.db.query.vendors.findMany({
      where: eq(vendors.userId, ctx.userId),
      orderBy: [asc(vendors.createdAt)],
    }),
  ),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        displayName: z.string().min(1).max(40),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [updated] = await ctx.db
        .update(vendors)
        .set({ displayName: input.displayName })
        .where(and(eq(vendors.id, input.id), eq(vendors.userId, ctx.userId)))
        .returning();
      if (!updated) throw new TRPCError({ code: "NOT_FOUND" });
      return updated;
    }),
});

export const accountsRouter = router({
  list: protectedProcedure.query(({ ctx }) =>
    ctx.db.query.vendorAccounts.findMany({
      where: eq(vendorAccounts.userId, ctx.userId),
      orderBy: [asc(vendorAccounts.createdAt)],
    }),
  ),

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
      await assertOwnsVendor(ctx.db, ctx.userId, input.vendorId);
      await assertOwnsProperty(ctx.db, ctx.userId, input.propertyId);
      const [created] = await ctx.db
        .insert(vendorAccounts)
        .values({ ...input, userId: ctx.userId })
        .returning();
      return created;
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        propertyId: z.string().uuid().optional(),
        label: z.string().nullable().optional(),
        active: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...rest } = input;
      if (input.propertyId)
        await assertOwnsProperty(ctx.db, ctx.userId, input.propertyId);
      const [updated] = await ctx.db
        .update(vendorAccounts)
        .set(rest)
        .where(
          and(eq(vendorAccounts.id, id), eq(vendorAccounts.userId, ctx.userId)),
        )
        .returning();
      if (!updated) throw new TRPCError({ code: "NOT_FOUND" });
      return updated;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      try {
        await ctx.db
          .delete(vendorAccounts)
          .where(
            and(
              eq(vendorAccounts.id, input.id),
              eq(vendorAccounts.userId, ctx.userId),
            ),
          );
      } catch {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Account has linked bills",
        });
      }
      return { ok: true };
    }),
});

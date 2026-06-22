import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import type { db as Db } from "@/db";
import { propertyMembers, vendors } from "@/db/schema";
import { OWNED_PROPERTY_LIMIT } from "@/lib/limits";

export { OWNED_PROPERTY_LIMIT };

/** Max accepted length of extracted bill text (~50 pages). Caps a single
 * client-supplied blob so one upload can't exhaust storage or stall the
 * synchronous parser. Shared by every procedure that accepts `rawText`. */
export const RAW_TEXT_MAX = 200_000;

/** The property ids the user can access — every property they own or were
 * invited into. The basis for all domain scoping: queries filter
 * `propertyId IN (these)` instead of the old per-user `userId` match. */
export async function accessibleProperties(
  db: typeof Db,
  userId: string,
): Promise<string[]> {
  const rows = await db.query.propertyMembers.findMany({
    where: eq(propertyMembers.userId, userId),
    columns: { propertyId: true },
  });
  return rows.map((r) => r.propertyId);
}

/** Throw unless `userId` is a member of `propertyId`; when `requiredRole` is
 * "owner", also require the owner role. Returns the membership row. Use before
 * any read or write scoped to a single property. */
export async function assertMember(
  db: typeof Db,
  userId: string,
  propertyId: string,
  requiredRole?: "owner",
): Promise<typeof propertyMembers.$inferSelect> {
  const row = await db.query.propertyMembers.findFirst({
    where: and(
      eq(propertyMembers.propertyId, propertyId),
      eq(propertyMembers.userId, userId),
    ),
  });
  if (!row)
    throw new TRPCError({ code: "NOT_FOUND", message: "Property not found" });
  if (requiredRole === "owner" && row.role !== "owner")
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only the property owner can do that",
    });
  return row;
}

/** Throw unless `vendorId` belongs to an property the caller can access. Use
 * before pointing a bill at a client-supplied vendor. */
export async function assertMemberVendor(
  db: typeof Db,
  userId: string,
  vendorId: string,
  requiredRole?: "owner",
): Promise<void> {
  const vendor = await db.query.vendors.findFirst({
    where: eq(vendors.id, vendorId),
    columns: { propertyId: true },
  });
  if (!vendor)
    throw new TRPCError({ code: "NOT_FOUND", message: "Vendor not found" });
  await assertMember(db, userId, vendor.propertyId, requiredRole);
}

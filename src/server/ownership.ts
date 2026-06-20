import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import type { db as Db } from "@/db";
import { properties, vendors } from "@/db/schema";

/** Max accepted length of extracted bill text (~50 pages). Caps a single
 * client-supplied blob so one upload can't exhaust storage or stall the
 * synchronous parser. Shared by every procedure that accepts `rawText`. */
export const RAW_TEXT_MAX = 200_000;

/** Throw unless `id` names a property owned by `userId`. Use before writing a
 * client-supplied propertyId onto another row, so a bill/account can't be
 * pointed at a property the caller doesn't own. */
export async function assertOwnsProperty(
  db: typeof Db,
  userId: string,
  id: string,
): Promise<void> {
  const row = await db.query.properties.findFirst({
    where: and(eq(properties.id, id), eq(properties.userId, userId)),
    columns: { id: true },
  });
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Property not found" });
}

/** Throw unless `id` names a vendor owned by `userId`. */
export async function assertOwnsVendor(
  db: typeof Db,
  userId: string,
  id: string,
): Promise<void> {
  const row = await db.query.vendors.findFirst({
    where: and(eq(vendors.id, id), eq(vendors.userId, userId)),
    columns: { id: true },
  });
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Vendor not found" });
}

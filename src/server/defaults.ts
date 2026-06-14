import type { db as Db } from "@/db";
import { vendors } from "@/db/schema";

/** Vendors every new account starts with — the seeded Buenos Aires categories.
 * Users rename/extend these from the Profile page. */
export const DEFAULT_VENDORS = [
  { slug: "edesur", displayName: "Edesur", category: "electricity" },
  { slug: "metrogas", displayName: "MetroGAS", category: "gas" },
  { slug: "telecom", displayName: "Telecom", category: "internet" },
  { slug: "mda-expensas", displayName: "Expensas MDA", category: "expensas" },
  {
    slug: "dominijanni-expensas",
    displayName: "Expensas Dominijanni",
    category: "expensas",
  },
] as const;

/** Seed the default vendors for a freshly-created user. Idempotent. */
export async function seedUserVendors(
  db: typeof Db,
  userId: string,
): Promise<void> {
  for (const v of DEFAULT_VENDORS) {
    const existing = await db.query.vendors.findFirst({
      where: (t, { and, eq }) =>
        and(eq(t.userId, userId), eq(t.slug, v.slug)),
    });
    if (!existing) {
      await db.insert(vendors).values({ ...v, userId });
    }
  }
}

import { eq } from "drizzle-orm";
import { pickVendorColor } from "../lib/vendorColors";
import { db } from "./index";
import { vendors } from "./schema";

/** One-time backfill: assign every existing vendor a random palette color,
 * distinct within its apartment where possible. New vendors get a color at
 * creation (see ensureVendor), so this only matters for rows that predate the
 * `color` column. Run with `dotenv -e .env.local tsx src/db/backfillVendorColors.ts`. */
async function main() {
  const all = await db.query.vendors.findMany({
    columns: { id: true, propertyId: true },
  });
  const byProperty = new Map<string, { id: string }[]>();
  for (const v of all) {
    const list = byProperty.get(v.propertyId) ?? [];
    list.push(v);
    byProperty.set(v.propertyId, list);
  }

  let updated = 0;
  for (const [, list] of byProperty) {
    const used: string[] = [];
    for (const v of list) {
      const color = pickVendorColor(used);
      used.push(color);
      await db.update(vendors).set({ color }).where(eq(vendors.id, v.id));
      updated++;
    }
  }
  console.log(`Backfilled colors for ${updated} vendors.`);
  process.exit(0);
}

main();

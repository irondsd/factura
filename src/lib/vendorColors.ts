// Vendors carry no color in the DB; the design assigns each a warm, muted hue.
// We map the seeded vendors to the exact prototype colors, and fall back to a
// per-category color for any user-created vendor. Pure (no React) so both the
// server (aggregation) and client (charts/legends) can import it.
import type { vendorCategory } from "@/db/schema";

type Category = (typeof vendorCategory.enumValues)[number];

const SLUG_COLORS: Record<string, string> = {
  edesur: "#d9480f", // electricity — the burnt-orange accent
  metrogas: "#c98a1a", // gas — amber
  telecom: "#7d8471", // internet — sage
  "mda-expensas": "#4a4034", // expensas — dark earth
  "dominijanni-expensas": "#6b5a45", // a second expensas — lighter earth
};

const CATEGORY_COLORS: Record<Category, string> = {
  electricity: "#d9480f",
  gas: "#c98a1a",
  internet: "#7d8471",
  expensas: "#4a4034",
  water: "#5f7470",
  other: "#9a8c74",
};

export function vendorColor(vendor: {
  slug: string;
  category: Category;
}): string {
  return SLUG_COLORS[vendor.slug] ?? CATEGORY_COLORS[vendor.category];
}

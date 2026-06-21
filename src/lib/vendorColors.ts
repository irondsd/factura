// Vendors store their color by *name* (e.g. "burnt-orange"). The hex values live
// in one place only — globals.css, as `--vendor-<name>` CSS variables plus
// matching `.vbg-<name>` background utilities — so the palette is themable from
// CSS without touching code. This module just holds the list of names and the
// helpers that map a name to either a CSS-variable reference (where a real color
// string is needed: recharts fills, server payloads) or a utility class (DOM
// swatches). Pure (no React) so server and client can both import it.

export const VENDOR_COLOR_NAMES = [
  "burnt-orange",
  "amber",
  "sage",
  "taupe",
  "earth",
  "slate-teal",
  "dark-earth",
  "rust",
  "ochre",
  "olive",
  "terracotta",
  "khaki",
  "clay",
  "moss",
] as const;

export type VendorColorName = (typeof VENDOR_COLOR_NAMES)[number];

/** Neutral fallback; also the DB column default for the migration. */
export const DEFAULT_VENDOR_COLOR: VendorColorName = "taupe";

const NAME_SET: ReadonlySet<string> = new Set(VENDOR_COLOR_NAMES);

export function isVendorColorName(s: string | null | undefined): s is VendorColorName {
  return s != null && NAME_SET.has(s);
}

/** A usable color *string* for a name — `var(--vendor-<name>)`. Works anywhere a
 * color is expected (recharts fill/stroke, inline style, SVG attrs). Unknown or
 * missing names fall back to the muted ink. */
export function vendorColorVar(name: string | null | undefined): string {
  return isVendorColorName(name) ? `var(--vendor-${name})` : "var(--muted)";
}

/** Background utility class for a name (defined in globals.css). */
export function vendorColorClass(name: string | null | undefined): string {
  return isVendorColorName(name) ? `vbg-${name}` : "vbg-fallback";
}

/** Pick a random color name, preferring one not already in `used` so vendors in
 * the same apartment don't collide until the palette is exhausted. */
export function pickVendorColor(used: Iterable<string> = []): VendorColorName {
  const taken = new Set(used);
  const free = VENDOR_COLOR_NAMES.filter((n) => !taken.has(n));
  const pool = free.length > 0 ? free : VENDOR_COLOR_NAMES;
  return pool[Math.floor(Math.random() * pool.length)];
}

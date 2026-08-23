import { SLUG_PATTERN } from "../metadata/guias";

/** Human text → one safe URL segment. Shared by browser creation and the MCP's
 * server-derived initial slug. */
export function slugifyCategory(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export const isCategorySlug = (value: string): boolean =>
  SLUG_PATTERN.test(value);

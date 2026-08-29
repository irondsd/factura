import { SLUG_PATTERN } from "../metadata/guias";

/** Human text to a safe public segment and immutable initial key. */
export function slugifyLocation(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export const isLocationSlug = (value: string): boolean =>
  SLUG_PATTERN.test(value);

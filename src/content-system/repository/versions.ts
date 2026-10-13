import "server-only";
import { sql } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { CONTENT_SECTIONS, type ContentSection } from "../types";

// What the public can currently see, as a handful of short hashes — read
// *uncached*, on every render of the surfaces that aggregate several sections
// (`sitemap.ts`, `feed.xml`, `llms.txt`), and folded into their cache keys.
//
// Why those surfaces cannot simply trust their tagged reads. `unstable_cache`
// keys an entry on the callback's source text, and every route bundle compiles
// the shared readers in `./sections` into a differently minified closure: a
// production build stores the same "published proveedores" list three or four
// times, once per bundle that reads it. The sitemap's copies are its own, and
// with `revalidate: false` the only thing that ever refreshes them is a tag
// expiry actually reaching them before the sitemap next renders. On 2026-10-12
// that failed: the deployment built at 14:52 UTC served a sitemap frozen at its
// build for nine hours — seven proveedores and a guía published since, all
// missing — while /llms.txt and /feed.xml, carrying the same tags over their
// own copies, listed every one. The route's hourly `revalidate` could not have
// repaired it: on a plain TTL expiry an entry with no TTL of its own is still
// valid, so a re-render re-serialises it.
//
// Keying on this fingerprint takes the tag out of the correctness argument. A
// render that sees an unchanged fingerprint reuses its cached data, which is
// right by construction; a render that sees a changed one misses and reads the
// database, whatever happened to any tag. So the route TTL becomes a real
// repair floor, and the tags stay the fast path — they still purge the route
// the moment something is published.
//
// The fingerprint covers exactly what a listing can show: which pages are
// public, at which address, through which revision (a publish or a rename
// always moves one of those; a working-copy save moves none), plus the
// category and location registries. It is a few hundred bytes per render.

/** Per-section fingerprints, plus the global location registry. A section's
 * covers its public pages and its categories. */
export type PublicContentVersions = Record<ContentSection, string> & {
  locations: string;
};

async function readVersions(): Promise<PublicContentVersions> {
  const versions = {
    ...Object.fromEntries(CONTENT_SECTIONS.map((section) => [section, ""])),
    locations: "",
  } as PublicContentVersions;
  // CI builds from code-owned fixtures, which cannot change under a build.
  if (process.env.CI_CONTENT_FIXTURES === "1") return versions;

  const { db } = await import("@/db");
  const rows = await db.execute<{ part: string; version: string }>(sql`
    select section as part, md5(string_agg(
      id::text || ':' || status || ':' || slug || ':' ||
      coalesce(published_revision_id::text, '') || ':' ||
      coalesce(preview_revision_id::text, ''), ',' order by id)) as version
    from cms_page where status <> 'draft' group by section
    union all
    select 'categories:' || section, md5(string_agg(
      id::text || ':' || lock_version || ':' || coalesce(retired_at::text, ''),
      ',' order by id))
    from cms_category group by section
    union all
    select 'locations', md5(string_agg(
      id::text || ':' || lock_version || ':' || coalesce(retired_at::text, ''),
      ',' order by id))
    from cms_location
  `);
  const parts = new Map(rows.map((row) => [row.part, row.version]));
  for (const section of CONTENT_SECTIONS) {
    versions[section] =
      `${parts.get(section) ?? ""}.${parts.get(`categories:${section}`) ?? ""}`;
  }
  versions.locations = parts.get("locations") ?? "";
  return versions;
}

/** One fingerprint for a surface that lists every section and the location
 * registry, and so has to move whenever any of them does. */
export const everyVersion = (versions: PublicContentVersions): string =>
  [versions.locations, ...CONTENT_SECTIONS.map((s) => versions[s])].join("|");

/** The current fingerprints. Deliberately not cached: it is the one read that
 * has to be fresh for every other one to be allowed not to be. */
export const publicContentVersions = (): Promise<PublicContentVersions> =>
  readVersions();

/** `read`, cached for as long as `version` stands.
 *
 * Inside the callback every cached repository read is *nested* in this one, and
 * `unstable_cache` answers a nested call from its source rather than its cache
 * — so a miss here really does go to the database, instead of collecting the
 * very entries that went stale. The nested reads add no tags to the route
 * either, which is why `tags` has to name every section `read` depends on: the
 * route inherits them from this entry, and they are what still purges it on a
 * publish.
 *
 * The result is JSON-serialised, so `read` must return plain data — ISO
 * strings, not `Date`s. */
export function cachedAtVersion<T>(
  keyParts: readonly string[],
  version: string,
  tags: readonly string[],
  read: () => Promise<T>,
): Promise<T> {
  return unstable_cache(
    // The version is the argument so that it lands in the cache key; the
    // callback itself has no use for it.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async (_version: string) => read(),
    ["versioned", ...keyParts],
    { revalidate: false, tags: [...tags] },
  )(version);
}

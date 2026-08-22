import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db as defaultDb, type Database } from "@/db";
import { cmsMedia } from "@/db/schema";
import { publicMediaUrl } from "./origin";

// The public site's read contract for media (cms.md).
//
// Small on purpose. The public renderer needs four facts about an image — where
// its bytes are, how big it is, and what its default alt says — and nothing
// else: not the object key, not who uploaded it, not whether it is in a
// collection. It must not import the CMS, so this reads the table directly the
// way `repository/postgres.ts` reads `cms_page`.

export type MediaRef = {
  id: string;
  src: string;
  width: number;
  height: number;
  defaultAlt: string;
  decorative: boolean;
  mimeType: string;
};

/** Resolve ids to renderable references, in one query.
 *
 * Batched by contract, not by convenience: a section list renders twenty
 * previews and an article can hold a dozen images, and one query per image
 * would make every page's cost depend on how illustrated it is.
 *
 * Only `ready` assets resolve. A trashed or purged id simply is not in the
 * returned map, and the caller decides what that means — a validation failure
 * in the CMS, a placeholder on the public site. */
export async function resolveMediaRefs(
  ids: readonly string[],
  database: Database = defaultDb,
): Promise<Map<string, MediaRef>> {
  const unique = [...new Set(ids)].filter(Boolean);
  const out = new Map<string, MediaRef>();
  if (unique.length === 0) return out;

  const rows = await database
    .select({
      id: cmsMedia.id,
      objectKey: cmsMedia.objectKey,
      width: cmsMedia.width,
      height: cmsMedia.height,
      mimeType: cmsMedia.mimeType,
      defaultAlt: cmsMedia.defaultAlt,
      decorative: cmsMedia.decorative,
    })
    .from(cmsMedia)
    .where(and(inArray(cmsMedia.id, unique), eq(cmsMedia.status, "ready")));

  for (const row of rows) {
    // A `ready` row missing any of these is an invariant breach, not a
    // renderable image: finalization sets all four together. Skipping it gives
    // the caller the same "unknown id" path as a purged asset, which is the
    // only behaviour that does not crash a live page.
    if (!row.objectKey || !row.width || !row.height || !row.mimeType) continue;
    out.set(row.id, {
      id: row.id,
      src: publicMediaUrl(row.objectKey),
      width: row.width,
      height: row.height,
      defaultAlt: row.defaultAlt,
      decorative: row.decorative,
      mimeType: row.mimeType,
    });
  }
  return out;
}

/** One reference, for a page's preview image. */
export async function resolveMediaRef(
  id: string | null | undefined,
  database: Database = defaultDb,
): Promise<MediaRef | null> {
  if (!id) return null;
  return (await resolveMediaRefs([id], database)).get(id) ?? null;
}

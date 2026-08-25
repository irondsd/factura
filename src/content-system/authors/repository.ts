import "server-only";
import { inArray } from "drizzle-orm";
import { db as defaultDb, type Database } from "@/db";
import { cmsAuthors } from "@/db/schema";
import { resolveMediaRefs } from "../media/repository";
import type { AuthorRef } from "./types";

// The public site's read contract for authors, mirroring
// `../media/repository.ts` (cms.md).
//
// Small on purpose, and it must not import the CMS: the public renderer needs
// the handful of facts that go into a Person node and nothing else — not who
// created the row, not the long biography that only the author page will read.
// So this reads `cms_author` directly, the way `repository/postgres.ts` reads
// `cms_page`.

export type { AuthorRef } from "./types";

/** Resolve ids to public references, in two queries regardless of how many.
 *
 * Batched for the same reason media is: an article credits at most two people,
 * but a listing that ever grows a byline column would otherwise pay a query per
 * row. An id nothing matches is simply absent from the map, and the caller
 * decides what that means — a validation error inside the CMS, an omitted
 * `author` on a public page. */
export async function resolveAuthorRefs(
  ids: readonly string[],
  database: Database = defaultDb,
): Promise<Map<string, AuthorRef>> {
  const unique = [...new Set(ids)].filter(Boolean);
  const out = new Map<string, AuthorRef>();
  if (unique.length === 0) return out;

  const rows = await database
    .select({
      id: cmsAuthors.id,
      name: cmsAuthors.name,
      slug: cmsAuthors.slug,
      jobTitle: cmsAuthors.jobTitle,
      tagline: cmsAuthors.tagline,
      imageMediaId: cmsAuthors.imageMediaId,
    })
    .from(cmsAuthors)
    .where(inArray(cmsAuthors.id, unique));

  // One media query for every portrait in the batch. A trashed or purged
  // portrait resolves to nothing, and the author is still published — a missing
  // image is not a reason to drop a byline.
  const portraits = await resolveMediaRefs(
    rows.map((row) => row.imageMediaId).filter((id): id is string => !!id),
    database,
  );

  for (const row of rows) {
    out.set(row.id, {
      id: row.id,
      name: row.name,
      slug: row.slug,
      jobTitle: row.jobTitle,
      tagline: row.tagline,
      image: row.imageMediaId
        ? (portraits.get(row.imageMediaId)?.src ?? null)
        : null,
    });
  }
  return out;
}

/** One reference, for a single credit. */
export async function resolveAuthorRef(
  id: string | null | undefined,
  database: Database = defaultDb,
): Promise<AuthorRef | null> {
  if (!id) return null;
  return (await resolveAuthorRefs([id], database)).get(id) ?? null;
}

/** Both of a page's credits, resolved together.
 *
 * The shape every article route wants: two optional ids in metadata, one query,
 * two nullable references out. Callers pass `metadata.authorId` and
 * `metadata.factCheckerId` and get back what the markup needs. */
export async function resolveAuthorCredits(
  credits: { authorId?: string; factCheckerId?: string },
  database: Database = defaultDb,
): Promise<{ author: AuthorRef | null; factChecker: AuthorRef | null }> {
  const refs = await resolveAuthorRefs(
    [credits.authorId, credits.factCheckerId].filter(
      (id): id is string => !!id,
    ),
    database,
  );
  return {
    author: credits.authorId ? (refs.get(credits.authorId) ?? null) : null,
    factChecker: credits.factCheckerId
      ? (refs.get(credits.factCheckerId) ?? null)
      : null,
  };
}

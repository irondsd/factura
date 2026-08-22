import "server-only";
import { cmsRowToSummary } from "@/content-system/repository/mapping";
import type { ContentDocument } from "@/content-system/types";
import type { RevisionRecord } from "./revisionStore";
import type { CmsPageRecord } from "./store";

/** A page and one of its revisions, as the `ContentDocument` every layer above
 * speaks.
 *
 * The composition the store's joins do in SQL, available to the service, which
 * reads the two halves separately: it has to decide *which* revision before it
 * can read one, so it cannot use a join that has already decided. Same mapper
 * underneath, so a document assembled here and one assembled by a query are the
 * same object. */
export function documentOf(
  page: CmsPageRecord,
  revision: RevisionRecord,
): ContentDocument {
  return { ...cmsRowToSummary(page, revision), body: revision.body };
}

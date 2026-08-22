import type { ContentStatus } from "../types";
import type { Audience } from "./visibility";

// Which stored copy a reader sees (cms.md).
//
// The companion to `./visibility`: that module answers *whether* a page may be
// read, this one answers *which version of it*. Both are pure and exhaustive
// for the same reason — the answer is security-relevant, and a rule spelled out
// as a `coalesce()` inside a query is a rule that gets tested once, if at all.
//
// The property that matters: a public read never selects the `wip` pointer. Not
// "does not today" — cannot, because `wip` is not a value this function
// returns for the `public` audience. That is what makes "editing never changes
// the published page" true rather than careful.

/** The page pointer a read follows. `null` is "this page has nothing to show
 * you", which is a draft to the public. */
export type RevisionPointer = "published" | "preview" | "wip" | null;

/** Which pointer a public read of a page in this status follows.
 *
 * - `published` → the live publication. Never the WIP, however recently saved.
 * - `preview`   → the promoted snapshot, not the latest save. Refreshing the
 *                 public preview is an explicit action (cms.md).
 * - `draft`     → nothing. Indistinguishable from a missing page, by design. */
export function publicPointer(status: ContentStatus): RevisionPointer {
  switch (status) {
    case "published":
      return "published";
    case "preview":
      return "preview";
    case "draft":
      return null;
  }
}

/** Which pointer the *CMS* follows when it wants "the document as the editor
 * would open it": the working copy if there is one, otherwise the best
 * baseline it would start from.
 *
 * Not a visibility decision — every CMS read is already behind membership —
 * but it is the same question asked once instead of in each of the list, the
 * editor and the validator. */
export function cmsPointer(page: {
  wipRevisionId: string | null;
  publishedRevisionId: string | null;
  previewRevisionId: string | null;
}): RevisionPointer {
  if (page.wipRevisionId) return "wip";
  if (page.publishedRevisionId) return "published";
  if (page.previewRevisionId) return "preview";
  return null;
}

export function pointerFor(
  audience: Audience,
  page: {
    status: ContentStatus;
    wipRevisionId: string | null;
    publishedRevisionId: string | null;
    previewRevisionId: string | null;
  },
): RevisionPointer {
  return audience === "public" ? publicPointer(page.status) : cmsPointer(page);
}

/** The revision id a pointer resolves to on a given page. */
export function revisionIdFor(
  pointer: RevisionPointer,
  page: {
    wipRevisionId: string | null;
    publishedRevisionId: string | null;
    previewRevisionId: string | null;
  },
): string | null {
  switch (pointer) {
    case "published":
      return page.publishedRevisionId;
    case "preview":
      return page.previewRevisionId;
    case "wip":
      return page.wipRevisionId;
    case null:
      return null;
  }
}

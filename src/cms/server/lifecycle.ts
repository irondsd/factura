import type { ContentStatus } from "@/content-system/types";

// The save/transition policy from cms.md §5.3, as pure functions. What
// validation a write must survive depends only on where the page is going, and
// that decision is small enough to state exactly once and test exhaustively.

/** How hard a write is checked.
 *
 * - `draft`   — grammar only. Ordinary editorial errors do not block a save;
 *               unfinished work is what a draft is for.
 * - `preview` — grammar + document validation. A preview URL is shareable, so
 *               it has to be a real page with real metadata.
 * - `publish` — grammar + document + collection + render. Everything. */
export const VALIDATION_LEVELS = ["draft", "preview", "publish"] as const;

export type ValidationLevel = (typeof VALIDATION_LEVELS)[number];

/** The level a plain save must meet, given where the page currently is.
 *
 * The rule that surprises people is the last one: saving an already-published
 * page requires full publish validation. Iteration 1 stores one mutable copy
 * (cms.md §3.2), so there is no previous published revision to keep serving
 * while a broken save sits in a draft — the save *is* the live page. */
export function levelForSave(status: ContentStatus): ValidationLevel {
  switch (status) {
    case "draft":
      return "draft";
    case "preview":
      return "preview";
    case "published":
      return "publish";
  }
}

/** The level a status transition must meet. Always the stricter of where the
 * page is and where it is going: unpublishing a page whose body no longer
 * validates must not be blocked — that is the lever an editor reaches for when
 * something is wrong with a live page. */
export function levelForTransition(
  from: ContentStatus,
  to: ContentStatus,
): ValidationLevel {
  // Leaving `published` for anything else is always allowed: taking a page down
  // is the recovery action, and gating it on the page being valid would mean
  // the pages most in need of it are the ones that cannot be taken down.
  if (to === "draft") return "draft";
  return levelForSave(to);
}

/** When a page first became public. Set on the first publish and never moved
 * again — an unpublish/republish keeps the original date, so the visible
 * dateline and the JSON-LD don't jump because a page was briefly down. */
export function nextPublishedAt(
  current: Date | null,
  nextStatus: ContentStatus,
  now: Date,
): Date | null {
  if (nextStatus !== "published") return current;
  return current ?? now;
}

/** Whether a write changed the content itself, as opposed to only its status.
 *
 * Drives `content_updated_at`, which is the "Actualizado el …" the reader sees.
 * A status flip is not an edit: unpublishing and republishing a page must not
 * tell every reader the article was rewritten today. */
export function isContentEdit(patch: {
  body?: string;
  title?: string;
  titleTag?: string | null;
  description?: string;
  summary?: string;
  cta?: string;
  canonicalSlug?: string | null;
  metadata?: unknown;
}): boolean {
  return Object.keys(patch).length > 0;
}

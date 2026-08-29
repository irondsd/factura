import { canRender } from "@/content-system/repository/visibility";
import type { ContentStatus } from "@/content-system/types";

// The save/transition policy from cms.md, as pure functions. What
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

/** The level a **working copy** save must meet: `draft`, always.
 *
 * This used to depend on the page's status, and had to: iteration 1 stored one
 * mutable copy, so saving a published page rewrote the live one and had to
 * survive the publish gate. Revisions (cms.md) removed the reason — a WIP
 * save cannot reach a reader, whatever state the page is in, so holding it to
 * the rules a *public* page must meet would only mean an editor cannot save
 * half-finished work on an article that happens to be live. Which is the whole
 * thing the working copy exists to allow.
 *
 * A constant rather than a function of status, because "it does not depend on
 * the status" is the property worth making unmistakable. */
export const WIP_VALIDATION_LEVEL: ValidationLevel = "draft";

/** The level a *publicly visible* copy of a page in this state must meet — the
 * gate a promotion to that state has to pass. */
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

/** Whether a first publication should also move the editorial timestamp.
 *
 * A page written on Monday and published on Friday has content that was last
 * *edited* Monday — truthful, but it makes `contentUpdatedAt` earlier than
 * `publishedAt`, which reads as "updated before it existed" and which the
 * validator rejects. At the moment of first publication the content is current
 * by definition, so the two are brought level; the page then shows a single
 * publication date rather than a nonsensical pair.
 *
 * Only on the *first* publication. A republish after an unpublish must not
 * claim the article was rewritten. */
export function stampsContentUpdatedAt(
  previouslyPublishedAt: Date | null,
  nextStatus: ContentStatus,
): boolean {
  return nextStatus === "published" && previouslyPublishedAt === null;
}

/** Whether a write changed the content itself, as opposed to only its status.
 *
 * Drives the revision's `content_updated_at`, which is the "Actualizado el …"
 * the reader sees. A status flip is not an edit: unpublishing and republishing
 * a page must not tell every reader the article was rewritten today. */
export function isContentEdit(patch: {
  body?: string;
  title?: string;
  titleTag?: string | null;
  description?: string;
  summary?: string;
  cta?: string;
  canonicalSlug?: string | null;
  metadata?: unknown;
}, current?: { metadata?: unknown }, next?: { metadata?: unknown }): boolean {
  const authoredKeys = Object.keys(patch).filter((key) => key !== "metadata");
  if (authoredKeys.length > 0) return true;
  if (!("metadata" in patch)) return false;
  if (!current || !next) return true;
  return stableWithoutLocations(current.metadata) !== stableWithoutLocations(next.metadata);
}

function stableWithoutLocations(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return JSON.stringify(value);
  }
  const rest = Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter(
      ([key]) => key !== "locations",
    ),
  );
  return JSON.stringify(
    Object.fromEntries(Object.entries(rest).sort(([a], [b]) => a.localeCompare(b))),
  );
}

/** Whether saving a working copy changes something a public visitor can already
 * see. **Never** — that is the point of the working copy (cms.md), and
 * this is a function rather than a comment so the claim has a call site and a
 * test.
 *
 * Before revisions this asked `canRender(status)`, because a save on a live
 * page *was* a change to the live page. Now a save writes a `wip` revision no
 * public pointer can reach, so there is nothing cached that is now wrong, for
 * any status. Expiring the section's tag anyway would throw away the whole
 * public cache on every keystroke-batch an editor commits. */
export function saveAffectsPublicCache(): boolean {
  return false;
}

/** Whether a status transition changes what the public can see.
 *
 * Either side counts, which is what makes it symmetric: publishing has to put
 * the page up, and unpublishing has to take it down. The one that is easy to
 * forget is `draft → preview`/`published`, where the invalidation is not about
 * a stale *page* but a stale **absence** — the path 404'd until a moment ago,
 * and that 404 is cached under the same tag. */
export function statusChangeAffectsPublicCache(
  from: ContentStatus,
  to: ContentStatus,
): boolean {
  return canRender(from, "public") || canRender(to, "public");
}

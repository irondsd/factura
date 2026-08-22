import type { ContentStatus } from "../types";

// The lifecycle rules, as data. cms.md defines three states and three
// questions to ask about each; every consumer asks one of those questions, and
// none of them may answer it themselves (cms.md: "Public pages never infer
// visibility themselves; the repository/service owns the rule").
//
// Pure and exhaustive on purpose: this is the security-relevant half of the
// repository, and a rule expressed as a `where` clause deep in a query is a
// rule that gets tested once, if at all.

/** Who is asking. `public` is an anonymous visitor on the live site; `cms` is
 * an authenticated editor, who sees everything. */
export type Audience = "public" | "cms";

/** Statuses a *direct URL* may render, per audience.
 *
 * `preview` is public here: a preview URL is deliberately shareable so an
 * editor can send a link to someone without an account. It is a
 * discoverability control, not an access control (cms.md) — which is why
 * `noindex, nofollow` and exclusion from every listing are what make it work,
 * and why nothing secret may go in one. */
const RENDERABLE: Record<Audience, readonly ContentStatus[]> = {
  public: ["preview", "published"],
  cms: ["draft", "preview", "published"],
};

/** Statuses that may appear in a *listing* — indexes, category hubs, related
 * content, sitemap, feed, `llms.txt`, OG routes, IndexNow.
 *
 * Only `published`, for the public. This is the single narrowest rule in the
 * system: it is what keeps an unfinished draft out of the sitemap, and it is
 * the direct replacement for the old module's unexported `allGuides()`. */
const LISTABLE: Record<Audience, readonly ContentStatus[]> = {
  public: ["published"],
  cms: ["draft", "preview", "published"],
};

export const renderableStatuses = (
  audience: Audience,
): readonly ContentStatus[] => RENDERABLE[audience];

export const listableStatuses = (
  audience: Audience,
): readonly ContentStatus[] => LISTABLE[audience];

/** May a direct request for this page's URL render it? */
export const canRender = (status: ContentStatus, audience: Audience): boolean =>
  RENDERABLE[audience].includes(status);

/** May this page appear in a list, a feed, or the sitemap? */
export const canList = (status: ContentStatus, audience: Audience): boolean =>
  LISTABLE[audience].includes(status);

/** Should the rendered page tell crawlers to stay away? True for anything that
 * is not `published` — the state exists so a page can be *read* without being
 * indexed, and that promise is kept in the markup. */
export const shouldNoindex = (status: ContentStatus): boolean =>
  status !== "published";

/** What the `<meta name="robots">` of an unpublished page says.
 *
 * `nofollow`, not the site's usual `noindex, follow`. Elsewhere on the site a
 * `noindex` page is "unlisted, not disowned" and its links should still carry a
 * crawler onward; cms.md asks for the stricter pair here, because a
 * preview URL is a working copy and nothing on it is an endorsement of what it
 * links to yet.
 *
 * Lives beside the lifecycle rather than in either metadata builder because
 * guides and the registry sections have separate ones, and this is the rule
 * both of them have to reach the same answer on. Structurally typed rather than
 * importing Next's `Metadata`, so nothing in the lifecycle layer depends on the
 * framework. */
export const UNPUBLISHED_ROBOTS = {
  index: false,
  follow: false,
  nocache: true,
  googleBot: { index: false, follow: false },
} as const;

/** Does this page belong in the sitemap, the feed and `llms.txt`? Identical to
 * public listability today, and named separately because it is a different
 * question that happens to have the same answer — a future `unlisted` status
 * would split them. */
export const isDiscoverable = (status: ContentStatus): boolean =>
  canList(status, "public");

import { pathSegments } from "@/content-system/hierarchy";

// Moving a page's address, decided as a pure function (cms.md).
//
// A rename is never one row. `cms_page.slug` holds the *full* path, so moving
// a page with children moves the children too — the alternative is a tree whose
// paths and parent links disagree, which every breadcrumb, index and public
// read then has to second-guess.
//
// So a rename is planned first and executed second: this module answers "what
// would this change", the service commits the answer in one transaction, and
// the rules are testable without a database.

/** The page shape a rename reasons about — identity and whether the address
 * being vacated was ever public. */
export type RenameCandidate = {
  id: string;
  slug: string;
  /** Null for a page that has never been published. Its old path never existed
   * for a reader, so vacating it leaves nothing to redirect. */
  publishedAt: string | null;
};

export type RenameMove = {
  id: string;
  from: string;
  to: string;
  /** Whether this move should leave a redirect behind. */
  redirect: boolean;
};

export type RenamePlan = {
  /** The page and every descendant, the page itself first. */
  moves: RenameMove[];
  /** Old paths to preserve — the `redirect` moves, by slug. */
  redirectsToAdd: string[];
  /** Paths a live page now occupies, whose redirects must go: a redirect that
   * shadows a real page would send a reader away from the page they asked for.
   * Every move's destination, whether or not anything currently redirects from
   * it. */
  redirectsToDrop: string[];
};

export type RenameProblem = { code: string; message: string };

export const RENAME_CODES = {
  invalid: "rename.invalid-slug",
  unchanged: "rename.unchanged",
  taken: "rename.slug-taken",
} as const;

/** One path segment: lowercase letters, digits and single hyphens. The same
 * shape `slugify` produces in the create form, stated here as the rule rather
 * than left to whatever an editor pastes into the box. */
const SEGMENT = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isValidSegment(segment: string): boolean {
  return SEGMENT.test(segment);
}

/** Plan the move of `page` to `nextSlug` against the rest of its section.
 *
 * `others` is every *other* page in the section — the caller's job, so this
 * stays pure. Returns either the plan or every problem with it; the caller
 * never has to run it to find out whether it would work.
 *
 * Descendants are found by path prefix rather than by `parent_id`: the prefix
 * is what a URL resolves against, and the two agree by invariant
 * (`checkHierarchy`). A page whose parent link is broken would still have its
 * address moved, which is the failure to prefer.
 */
export function planRename(
  page: RenameCandidate,
  nextSlug: string,
  others: readonly RenameCandidate[],
): { ok: true; plan: RenamePlan } | { ok: false; problems: RenameProblem[] } {
  const problems: RenameProblem[] = [];
  const segments = pathSegments(nextSlug);

  if (segments.length === 0 || !segments.every(isValidSegment)) {
    problems.push({
      code: RENAME_CODES.invalid,
      message: `"${nextSlug}" no es una dirección válida. Usa minúsculas, números y guiones — por ejemplo "como-leer-una-factura".`,
    });
    return { ok: false, problems };
  }

  const to = segments.join("/");
  if (to === page.slug) {
    problems.push({
      code: RENAME_CODES.unchanged,
      message: "La dirección es la que ya tiene la página.",
    });
    return { ok: false, problems };
  }

  const moves: RenameMove[] = [
    { id: page.id, from: page.slug, to, redirect: page.publishedAt !== null },
  ];
  const prefix = `${page.slug}/`;
  for (const other of others) {
    if (!other.slug.startsWith(prefix)) continue;
    moves.push({
      id: other.id,
      from: other.slug,
      to: `${to}/${other.slug.slice(prefix.length)}`,
      redirect: other.publishedAt !== null,
    });
  }

  // A destination another page already holds. Checked against the pages that
  // are *not* moving: two pages inside the same moved subtree can never collide
  // with each other, because the whole subtree shifts by the same prefix.
  const moving = new Set(moves.map((move) => move.id));
  const occupied = new Map(
    others
      .filter((other) => !moving.has(other.id))
      .map((other) => [other.slug, other]),
  );
  for (const move of moves) {
    if (occupied.has(move.to)) {
      problems.push({
        code: RENAME_CODES.taken,
        message: `Ya hay una página en "${move.to}".`,
      });
    }
  }
  if (problems.length > 0) return { ok: false, problems };

  return {
    ok: true,
    plan: {
      moves,
      redirectsToAdd: moves
        .filter((move) => move.redirect)
        .map((move) => move.from),
      redirectsToDrop: moves.map((move) => move.to),
    },
  };
}

import type { ContentDocument, ContentSummary } from "./types";

// Page hierarchy, uniform across every section.
//
// Statistics needed a second level first — `/estadisticas/inflacion-de-vivienda`
// and its six regions — but the capability is not a statistics feature. Guides
// will want a hub with children the first time a topic outgrows one page, and
// news will want it on day one. Building it per section is how a codebase ends
// up with `if (section === "estadisticas")` in the list, the editor, the
// breadcrumb, the sitemap and the validator.
//
// So every page in every section has a parent slot and a sort order. Guides
// simply all sit at the top level today, which is a fact about the content, not
// a limitation of the model.
//
// Two representations, deliberately, and one invariant tying them together:
//
//   `slug`      the full path — "inflacion-de-vivienda/gba". This is what a URL
//               resolves against, so a public read stays a single indexed
//               equality lookup rather than a recursive walk.
//   `parentId`  the editorial tree, which is what an editor reorders and what a
//               breadcrumb and an index are built from.
//
// The invariant: a page with a parent has that parent's slug as its path
// prefix. Checked in one place (`checkHierarchy`) on every write, so the two
// representations cannot drift.

/** The pieces of a document this module needs. Kept minimal so a summary, a
 * full document or an unsaved draft can all be passed. */
export type HierarchyNode = {
  id: string;
  section: string;
  slug: string;
  parentId: string | null;
  sortOrder: number;
};

export const HIERARCHY_CODES = {
  parentMissing: "hierarchy.parent-missing",
  parentOtherSection: "hierarchy.parent-other-section",
  parentSelf: "hierarchy.parent-self",
  parentCycle: "hierarchy.parent-cycle",
  slugPrefix: "hierarchy.slug-prefix",
  orphanPath: "hierarchy.orphan-path",
} as const;

/** The path segments of a slug. `""` has no segments rather than one empty
 * one, which is what makes a root page's parent path empty. */
export const pathSegments = (slug: string): string[] =>
  slug.split("/").filter((segment) => segment !== "");

/** The slug of the page that should be this one's parent, or null when it is a
 * top-level page. Purely textual — it says what the path implies, not what the
 * database records. */
export function parentSlugFromPath(slug: string): string | null {
  const segments = pathSegments(slug);
  return segments.length > 1 ? segments.slice(0, -1).join("/") : null;
}

/** The last segment — what an editor types when creating a child. */
export const ownSegment = (slug: string): string =>
  pathSegments(slug).at(-1) ?? "";

/** How deep a page sits. A top-level page is depth 1. */
export const depthOf = (slug: string): number => pathSegments(slug).length;

export type HierarchyProblem = { code: string; message: string };

/** Check one page's placement against the rest of its section.
 *
 * Returns every problem rather than the first, because the editor shows them
 * together. An empty array means the write is consistent.
 *
 * `siblings` is every other page in the section — the caller's job, so this
 * function stays pure and can be run against a hypothetical tree. */
export function checkHierarchy(
  node: HierarchyNode,
  others: readonly HierarchyNode[],
): HierarchyProblem[] {
  const problems: HierarchyProblem[] = [];
  const impliedParent = parentSlugFromPath(node.slug);

  if (node.parentId === null) {
    // A path with more than one segment and no parent row would render at a URL
    // whose parent does not exist — the "every intermediate path exists"
    // invariant cms.md §12 asks for, enforced for every section rather than
    // just the two that have hubs today.
    if (impliedParent !== null) {
      problems.push({
        code: HIERARCHY_CODES.orphanPath,
        message: `"${node.slug}" sits under "${impliedParent}", which is not set as its parent page. Either choose that parent or give this page a top-level path.`,
      });
    }
    return problems;
  }

  if (node.parentId === node.id) {
    problems.push({
      code: HIERARCHY_CODES.parentSelf,
      message: "A page cannot be its own parent.",
    });
    return problems;
  }

  const parent = others.find((other) => other.id === node.parentId);
  if (!parent) {
    problems.push({
      code: HIERARCHY_CODES.parentMissing,
      message: "The chosen parent page does not exist.",
    });
    return problems;
  }

  if (parent.section !== node.section) {
    problems.push({
      code: HIERARCHY_CODES.parentOtherSection,
      message: `The chosen parent is in ${parent.section}, not ${node.section}. A page's parent must be in the same section.`,
    });
  }

  if (node.slug !== `${parent.slug}/${ownSegment(node.slug)}`) {
    problems.push({
      code: HIERARCHY_CODES.slugPrefix,
      message: `"${node.slug}" does not sit under its parent "${parent.slug}". A child's path is its parent's path plus one segment — "${parent.slug}/${ownSegment(node.slug)}".`,
    });
  }

  // Walk up from the parent. A cycle would otherwise hang every breadcrumb,
  // index and sitemap that follows the tree.
  //
  // The walk resolves against `node` as well as `others`: the shortest possible
  // loop is two pages naming each other, and looking only at the others would
  // walk straight past the page being checked and find nothing.
  const universe = [node, ...others];
  const seen = new Set<string>();
  let current: HierarchyNode | undefined = parent;
  while (current) {
    if (seen.has(current.id) || current.id === node.id) {
      problems.push({
        code: HIERARCHY_CODES.parentCycle,
        message: "That parent would create a loop in the page tree.",
      });
      break;
    }
    seen.add(current.id);
    const nextId: string | null = current.parentId;
    current = nextId
      ? universe.find((other) => other.id === nextId)
      : undefined;
  }

  return problems;
}

/** The chain from a page up to its top-level ancestor, nearest first. What a
 * breadcrumb renders, in reverse. */
export function ancestorsOf<T extends HierarchyNode>(
  node: T,
  all: readonly T[],
): T[] {
  const chain: T[] = [];
  const seen = new Set<string>([node.id]);
  let current = node.parentId
    ? all.find((other) => other.id === node.parentId)
    : undefined;
  while (current && !seen.has(current.id)) {
    chain.push(current);
    seen.add(current.id);
    const parentId: string | null = current.parentId;
    current = parentId ? all.find((other) => other.id === parentId) : undefined;
  }
  return chain;
}

export type ContentTreeNode<T> = { page: T; children: ContentTreeNode<T>[] };

/** Build the editorial tree: top-level pages in `sortOrder`, each with its
 * children in `sortOrder`. Drives the CMS list, the section index and the
 * breadcrumbs, for every section, with no per-section branch.
 *
 * A page whose parent is missing from `pages` is treated as top level rather
 * than dropped — a filtered list (published only, say) can legitimately exclude
 * a parent, and silently losing its children would be worse than showing them
 * flat. */
export function buildContentTree<T extends HierarchyNode>(
  pages: readonly T[],
): ContentTreeNode<T>[] {
  const byId = new Map(pages.map((page) => [page.id, page]));
  const childrenOf = new Map<string | null, T[]>();

  for (const page of pages) {
    const key = page.parentId && byId.has(page.parentId) ? page.parentId : null;
    childrenOf.set(key, [...(childrenOf.get(key) ?? []), page]);
  }

  const order = (a: T, b: T) =>
    a.sortOrder - b.sortOrder || a.slug.localeCompare(b.slug);

  const build = (parentId: string | null): ContentTreeNode<T>[] =>
    (childrenOf.get(parentId) ?? [])
      .sort(order)
      .map((page) => ({ page, children: build(page.id) }));

  return build(null);
}

/** The tree flattened back into a list, parents immediately before their
 * children. What the CMS list renders, with `depthOf` driving the indent. */
export function flattenTree<T extends HierarchyNode>(
  nodes: readonly ContentTreeNode<T>[],
): T[] {
  return nodes.flatMap((node) => [node.page, ...flattenTree(node.children)]);
}

export type { ContentDocument, ContentSummary };

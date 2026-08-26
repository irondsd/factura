import {
  buildContentTree,
  flattenTree,
  type ContentSummary,
} from "@/content-system/hierarchy";
import { type ContentStatus, isContentStatus } from "@/content-system/types";

// The CMS list's URL state: status filter and column sort.
//
// Both live in the query string rather than in client state — the result is a
// URL you can bookmark and send, the server does the work in the query it was
// already running, and there is no second copy of "what is on screen" to fall
// out of step.
//
// Searching used to be here too, as a `q` on each section's list. It is not any
// more: `src/cms/search.ts` searches every section and reads the body, so the
// per-section box was left answering a narrower question worse. A stale
// bookmark carrying `?q=…` simply lists the section, which is the same thing
// this file does with any parameter it no longer recognises.
//
// Pure and free of I/O so the ordering rules can be tested without a database.

/** The sortable columns, spelled the way they appear in the URL. */
export const CMS_SORT_COLUMNS = ["creada", "editada"] as const;

export type CmsSortColumn = (typeof CMS_SORT_COLUMNS)[number];

export type CmsSortDirection = "asc" | "desc";

export type CmsListSort = {
  column: CmsSortColumn;
  direction: CmsSortDirection;
};

/** Most recently edited first: an editor's list opens on what they were last
 * working on. */
export const DEFAULT_CMS_SORT: CmsListSort = {
  column: "editada",
  direction: "desc",
};

export type CmsListQuery = {
  status?: ContentStatus;
  sort: CmsListSort;
};

const isSortColumn = (value: string): value is CmsSortColumn =>
  (CMS_SORT_COLUMNS as readonly string[]).includes(value);

/** Read the list's state out of the query string. Anything unrecognised falls
 * back to the default rather than 404ing — a hand-edited URL should show the
 * list, not an error page. */
export function parseCmsListQuery(params: {
  estado?: string;
  orden?: string;
  dir?: string;
}): CmsListQuery {
  const column =
    params.orden && isSortColumn(params.orden)
      ? params.orden
      : DEFAULT_CMS_SORT.column;
  return {
    status:
      params.estado && isContentStatus(params.estado)
        ? params.estado
        : undefined,
    sort: {
      column,
      direction: params.dir === "asc" ? "asc" : "desc",
    },
  };
}

export const isDefaultSort = (sort: CmsListSort): boolean =>
  sort.column === DEFAULT_CMS_SORT.column &&
  sort.direction === DEFAULT_CMS_SORT.direction;

/** The URL for one state of the list. The default sort is left out, so the
 * plain section address is the one an editor lands on and shares. */
export function cmsListHref(basePath: string, query: CmsListQuery): string {
  const params = new URLSearchParams();
  if (query.status) params.set("estado", query.status);
  if (!isDefaultSort(query.sort)) {
    params.set("orden", query.sort.column);
    params.set("dir", query.sort.direction);
  }
  const search = params.toString();
  return search ? `${basePath}?${search}` : basePath;
}

/** What clicking a column header should do: sort by it, or flip the direction
 * if it is already the sorted column. A first click on a date column asks for
 * newest first, which is what "sort by when this happened" means. */
export function toggleSort(
  current: CmsListSort,
  column: CmsSortColumn,
): CmsListSort {
  if (current.column !== column) return { column, direction: "desc" };
  return {
    column,
    direction: current.direction === "desc" ? "asc" : "desc",
  };
}

/** The rows to render, in order.
 *
 * Still the tree: sorting reorders *siblings*, it does not flatten the
 * hierarchy into a date-ordered list. A child that jumped above its parent
 * would keep the indentation of a tree while showing none of its structure,
 * and the path under each title would be the only thing left explaining the
 * shape. Guides are all top level, so for them this is exactly a flat sort. */
export function sortedContentRows<T extends ContentSummary>(
  pages: readonly T[],
  sort: CmsListSort,
): T[] {
  const key = (page: T) =>
    sort.column === "creada" ? page.createdAt : page.updatedAt;
  const sign = sort.direction === "desc" ? -1 : 1;

  const compare = (a: T, b: T) =>
    sign * (Date.parse(key(a)) - Date.parse(key(b))) ||
    a.slug.localeCompare(b.slug);

  return flattenTree(sortTree(buildContentTree([...pages]), compare));
}

type Node<T> = { page: T; children: Node<T>[] };

function sortTree<T>(
  nodes: Node<T>[],
  compare: (a: T, b: T) => number,
): Node<T>[] {
  return [...nodes]
    .sort((a, b) => compare(a.page, b.page))
    .map((node) => ({ ...node, children: sortTree(node.children, compare) }));
}

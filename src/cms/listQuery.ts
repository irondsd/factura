import {
  buildContentTree,
  flattenTree,
  type ContentSummary,
} from "@/content-system/hierarchy";
import { type ContentStatus, isContentStatus } from "@/content-system/types";
import type { CmsContentSummary } from "./types";

// The CMS list's URL state: every filter, and the column sort.
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

/** The narrowing half of the list's state. Every member is optional and
 * absent means "not narrowed by this", so an empty object is the whole
 * section — which is what the plain section address renders.
 *
 * One value per facet rather than a set: «las guías de Daria sobre tarifas» is
 * a question editors ask, «las de Daria o de Julián» is not, and a single value
 * per facet is what keeps the URL, the chips and the dialog all readable. */
export type CmsListFilters = {
  status?: ContentStatus;
  /** `cms_author` id credited as the byline. */
  authorId?: string;
  /** `cms_author` id credited with checking the numbers. */
  factCheckerId?: string;
  /** A category key, section-scoped like the registry it comes from. */
  category?: string;
  /** A location key from the global registry. */
  location?: string;
  /** Whether a saved working copy is waiting behind what readers see. True
   * keeps only those pages, false keeps only the ones with nothing pending;
   * absent asks nothing. This is exactly what the row's «Borrador guardado»
   * line reports, so the filter and the column cannot disagree. */
  unpublishedChanges?: boolean;
};

/** The filter facets, in the order the dialog and the chips list them. */
export const CMS_FILTER_KEYS = [
  "status",
  "authorId",
  "factCheckerId",
  "category",
  "location",
  "unpublishedChanges",
] as const satisfies readonly (keyof CmsListFilters)[];

export type CmsFilterKey = (typeof CMS_FILTER_KEYS)[number];

export type CmsListQuery = CmsListFilters & {
  sort: CmsListSort;
};

const isSortColumn = (value: string): value is CmsSortColumn =>
  (CMS_SORT_COLUMNS as readonly string[]).includes(value);

/** A free-form key out of the query string — a category, a location, an author
 * id. Nothing here checks it against a registry: the parser is pure, the
 * registries live in the database, and a key nothing matches simply selects no
 * rows, which is a truthful answer to a hand-edited URL. Capped so a pathological
 * one cannot travel any further than this function. */
const key = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim();
  return trimmed && trimmed.length <= 120 ? trimmed : undefined;
};

/** Read the list's state out of the query string. Anything unrecognised falls
 * back to the default rather than 404ing — a hand-edited URL should show the
 * list, not an error page. */
export function parseCmsListQuery(params: {
  estado?: string;
  autor?: string;
  verificador?: string;
  categoria?: string;
  ubicacion?: string;
  cambios?: string;
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
    authorId: key(params.autor),
    factCheckerId: key(params.verificador),
    category: key(params.categoria),
    location: key(params.ubicacion),
    // Only the two words mean anything; anything else is read as "no opinion"
    // rather than silently taken for one of them.
    unpublishedChanges:
      params.cambios === "si"
        ? true
        : params.cambios === "no"
          ? false
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
  if (query.authorId) params.set("autor", query.authorId);
  if (query.factCheckerId) params.set("verificador", query.factCheckerId);
  if (query.category) params.set("categoria", query.category);
  if (query.location) params.set("ubicacion", query.location);
  if (query.unpublishedChanges !== undefined) {
    params.set("cambios", query.unpublishedChanges ? "si" : "no");
  }
  if (!isDefaultSort(query.sort)) {
    params.set("orden", query.sort.column);
    params.set("dir", query.sort.direction);
  }
  const search = params.toString();
  return search ? `${basePath}?${search}` : basePath;
}

/** Which facets are currently narrowing the list. Drives the badge on the
 * dialog's button and the row of chips under it — both of which exist so that
 * a filtered list never looks like an empty section. */
export function activeCmsFilterKeys(query: CmsListQuery): CmsFilterKey[] {
  return CMS_FILTER_KEYS.filter((facet) => query[facet] !== undefined);
}

export const countActiveCmsFilters = (query: CmsListQuery): number =>
  activeCmsFilterKeys(query).length;

export const hasActiveCmsFilters = (query: CmsListQuery): boolean =>
  activeCmsFilterKeys(query).length > 0;

/** The same list with one facet released. The sort survives: they are
 * independent choices about the same list, and clearing one by touching the
 * other is the kind of thing you only notice after re-sorting for the third
 * time. */
export function withoutCmsFilter(
  query: CmsListQuery,
  facet: CmsFilterKey,
): CmsListQuery {
  return { ...query, [facet]: undefined };
}

/** Every facet released, the sort kept. */
export function clearedCmsFilters(query: CmsListQuery): CmsListQuery {
  return { sort: query.sort };
}

/** Whether one page survives the filters. Facets are ANDed: each one the editor
 * sets narrows what the previous ones left. */
export function matchesCmsListQuery(
  page: CmsContentSummary,
  query: CmsListQuery,
): boolean {
  if (query.status && page.status !== query.status) return false;
  if (query.authorId && page.metadata?.authorId !== query.authorId) return false;
  if (
    query.factCheckerId &&
    page.metadata?.factCheckerId !== query.factCheckerId
  ) {
    return false;
  }
  // A row whose stored metadata failed to parse carries no categories and no
  // locations at all, so it drops out of either filter rather than being
  // guessed at — it is still listed unfiltered, saying what is wrong with it.
  if (
    query.category &&
    !(page.metadata?.categories ?? []).includes(query.category)
  ) {
    return false;
  }
  if (
    query.location &&
    !(page.metadata?.locations ?? []).includes(query.location)
  ) {
    return false;
  }
  if (
    query.unpublishedChanges !== undefined &&
    hasUnpublishedChanges(page) !== query.unpublishedChanges
  ) {
    return false;
  }
  return true;
}

/** A saved working copy waiting behind something readers can already reach.
 *
 * Draft pages are excluded on purpose: everything about a draft is unpublished,
 * so counting them here would make the filter mean "drafts, plus the pages this
 * is actually about". It is the same rule `WorkingCopyIndicator` renders by. */
export const hasUnpublishedChanges = (page: CmsContentSummary): boolean =>
  page.hasWip && page.status !== "draft";

/** The rows that survive the filters, in the order they came in. Ordering is
 * `sortedContentRows`' job, and it runs after this. */
export function filterContentRows<T extends CmsContentSummary>(
  pages: readonly T[],
  query: CmsListQuery,
): T[] {
  return pages.filter((page) => matchesCmsListQuery(page, query));
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

import type { CmsContentSummary } from "./types";
import {
  CMS_MISSING_AUTHOR,
  CMS_MISSING_CATEGORY,
  CMS_MISSING_FACT_CHECKER,
  CMS_MISSING_LOCATION,
} from "./listQuery";

// What the filter dialog offers, derived from the section that is on screen.
//
// The options are built from the pages themselves, not from the registries
// alone: a category nobody used and an author who has never signed a page in
// this section are choices that can only ever return an empty list, and a
// dropdown of forty locations when six are in use is a worse control than no
// control. So the registries supply the *labels* and the pages supply the
// *choices*.
//
// Counts come from the unfiltered section, the way the status tabs' do. They
// answer "how much is there", not "how much would be left if I also picked
// this" — the second reading needs every count recomputed per keystroke, and it
// makes a facet you already picked read as though it filtered nothing.
//
// Pure and free of I/O, so the derivation is testable without a database.

/** One choice in one facet. `value` is the key that goes in the URL. */
export type CmsFilterOption = { value: string; label: string; count: number };

export type CmsFilterOptions = {
  authors: CmsFilterOption[];
  factCheckers: CmsFilterOption[];
  categories: CmsFilterOption[];
  locations: CmsFilterOption[];
};

/** Just enough of a registry entry to label a key. Structural so the categories
 * registry, the locations registry and the resolved author refs can each be
 * passed as they already are. */
type Labelled = { key: string; label: string };

export function buildCmsFilterOptions({
  pages,
  categories,
  locations,
  authors,
}: {
  pages: readonly CmsContentSummary[];
  /** The section's category registry, in registry order. */
  categories: readonly Labelled[];
  /** The global location registry, alphabetized. */
  locations: readonly Labelled[];
  /** Credited people by id, as the list already resolves them for its rows. */
  authors: ReadonlyMap<string, { name: string }>;
}): CmsFilterOptions {
  const authorLabel = (id: string) => authors.get(id)?.name ?? id;
  const authorOptions = byUsage(
    pages,
    (page) => (page.metadata?.authorId ? [page.metadata.authorId] : []),
    authorLabel,
  ).sort(byLabel);
  const factCheckerOptions = byUsage(
    pages,
    (page) =>
      page.metadata?.factCheckerId ? [page.metadata.factCheckerId] : [],
    authorLabel,
  ).sort(byLabel);
  const categoryOptions = inRegistryOrder(
    categories,
    countKeys(pages, (page) => page.metadata?.categories ?? []),
  );
  const locationOptions = inRegistryOrder(
    locations,
    countKeys(pages, (page) => page.metadata?.locations ?? []),
  );

  return {
    // Empty is a real choice, not the same thing as «any»: it narrows the list
    // to pages whose metadata leaves this optional field unset.
    authors: withMissingOption(
      authorOptions,
      countMissingScalar(pages, "authorId"),
      CMS_MISSING_AUTHOR,
      "Sin autor",
    ),
    factCheckers: withMissingOption(
      factCheckerOptions,
      countMissingScalar(pages, "factCheckerId"),
      CMS_MISSING_FACT_CHECKER,
      "Sin verificador",
    ),
    // Registry order, not usage order: the categories dialog is the same list
    // an editor arranges in the category manager, and a second ordering of the
    // same words invites the question of which one is real. «Sin categoría»
    // and «Sin ubicación» lead each list because they are the empty state, not
    // registry entries.
    categories: withMissingOption(
      categoryOptions,
      countEmptyList(pages, "categories"),
      CMS_MISSING_CATEGORY,
      "Sin categoría",
    ),
    locations: withMissingOption(
      locationOptions,
      countEmptyList(pages, "locations"),
      CMS_MISSING_LOCATION,
      "Sin ubicación",
    ),
  };
}

const byLabel = (a: CmsFilterOption, b: CmsFilterOption) =>
  a.label.localeCompare(b.label, "es");

/** How many pages name each key. A page naming the same key twice — which
 * stored metadata can, however it got that way — still counts once. */
function countKeys(
  pages: readonly CmsContentSummary[],
  keysOf: (page: CmsContentSummary) => readonly string[],
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const page of pages) {
    for (const key of new Set(keysOf(page))) {
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return counts;
}

function byUsage(
  pages: readonly CmsContentSummary[],
  keysOf: (page: CmsContentSummary) => readonly string[],
  label: (key: string) => string,
): CmsFilterOption[] {
  return [...countKeys(pages, keysOf)].map(([value, count]) => ({
    value,
    label: label(value),
    count,
  }));
}

function withMissingOption(
  options: CmsFilterOption[],
  count: number,
  value: string,
  label: string,
): CmsFilterOption[] {
  // Keep the empty state discoverable even when this section currently has no
  // matching pages. Once a facet has any readable value, a zero-count option
  // is still a valid question an editor can ask about future or newly imported
  // content. Truly empty or unreadable facets still stay hidden.
  return options.length > 0 || count > 0
    ? [{ value, label, count }, ...options]
    : options;
}

function countMissingScalar(
  pages: readonly CmsContentSummary[],
  field: "authorId" | "factCheckerId",
): number {
  return pages.filter(
    (page) =>
      !page.metadataError &&
      page.metadata !== undefined &&
      !page.metadata[field],
  ).length;
}

function countEmptyList(
  pages: readonly CmsContentSummary[],
  field: "categories" | "locations",
): number {
  return pages.filter((page) => {
    const values = page.metadata?.[field];
    return !page.metadataError && Array.isArray(values) && values.length === 0;
  }).length;
}

/** The registry entries that are actually in use, in the registry's own order.
 * A key on a page that the registry no longer knows is dropped: it cannot be
 * labelled, and offering a raw key as a choice explains nothing. */
function inRegistryOrder(
  registry: readonly Labelled[],
  counts: ReadonlyMap<string, number>,
): CmsFilterOption[] {
  return registry
    .filter((entry) => (counts.get(entry.key) ?? 0) > 0)
    .map((entry) => ({
      value: entry.key,
      label: entry.label,
      count: counts.get(entry.key) ?? 0,
    }));
}

/** The label a chip should show for one selected key.
 *
 * Falls back to the key itself, which is what a hand-edited URL or a
 * since-retired registry entry leaves behind. Showing the raw key is the honest
 * answer there: the list is filtered by *something*, and the chip is what
 * releases it. */
export function filterOptionLabel(
  options: readonly CmsFilterOption[],
  value: string,
): string {
  return (
    options.find((option) => option.value === value)?.label ??
    MISSING_FILTER_LABELS[value] ??
    value
  );
}

const MISSING_FILTER_LABELS: Record<string, string> = {
  [CMS_MISSING_AUTHOR]: "Sin autor",
  [CMS_MISSING_FACT_CHECKER]: "Sin verificador",
  [CMS_MISSING_CATEGORY]: "Sin categoría",
  [CMS_MISSING_LOCATION]: "Sin ubicación",
};

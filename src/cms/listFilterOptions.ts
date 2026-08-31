import type { CmsContentSummary } from "./types";

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

  return {
    authors: byUsage(
      pages,
      (page) => (page.metadata?.authorId ? [page.metadata.authorId] : []),
      authorLabel,
    ).sort(byLabel),
    factCheckers: byUsage(
      pages,
      (page) =>
        page.metadata?.factCheckerId ? [page.metadata.factCheckerId] : [],
      authorLabel,
    ).sort(byLabel),
    // Registry order, not usage order: the categories dialog is the same list
    // an editor arranges in the category manager, and a second ordering of the
    // same words invites the question of which one is real.
    categories: inRegistryOrder(
      categories,
      countKeys(pages, (page) => page.metadata?.categories ?? []),
    ),
    locations: inRegistryOrder(
      locations,
      countKeys(pages, (page) => page.metadata?.locations ?? []),
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
  return options.find((option) => option.value === value)?.label ?? value;
}

import type { DataColumn } from "@/components/figures/DataTable";
import { FEATURED_BARRIOS } from "@/content/shared/caba";

// The "barrios más consultados" figure, minus everything that differs.
//
// Three pages carry one — sale, rent and yield — and they are the same figure
// asked of three datasets: the same six barrios, ranked by that page's own
// measure, with the same first column naming each one and its position among
// the barrios the source published a figure for.
//
// What is shared is exactly this much: the list, the sort, and that first
// column. The value columns are not — a rent page prints a monthly figure and a
// price per metre, a yield page prints a percentage and a payback in years —
// and neither is the prose. Those stay in their own files, which is why this is
// two small exports rather than a `<Buscados data="…" />` component: the
// columns and the paragraphs are the whole of what is left, and routing them
// through a registry would move them rather than remove them.

/** A featured barrio and whatever the page's dataset knows about it. `null`
 * where the source withheld the figure this quarter, which on the rent page is
 * roughly a third of the city. */
export type FeaturedRow<T> = { id: string; data: T | null };

/** The six barrios, each looked up in the caller's dataset and ordered by the
 * caller's measure, largest first. Withheld barrios have no rank, so they sort
 * last rather than to zero. */
export function featuredRows<T>(
  lookup: (id: string) => T | null,
  by: (data: T) => number,
): FeaturedRow<T>[] {
  return FEATURED_BARRIOS.map((id) => ({ id, data: lookup(id) })).sort(
    (a, b) => (b.data ? by(b.data) : -1) - (a.data ? by(a.data) : -1),
  );
}

/** The first column: the barrio's name, and under it the comuna and where it
 * places among the barrios that have a figure. The rank rides in the second
 * line rather than in a column of its own because two money columns are all a
 * narrow phone has room for beside a name. */
export function featuredBarrioColumn<
  T extends { label: string; meta: string; rank: number; of: number },
>(noData: string): DataColumn<FeaturedRow<T>> {
  return {
    header: "Barrio",
    cellClassName: "align-top",
    cell: ({ id, data }) => (
      <>
        <span className="text-ink">{data?.label ?? id}</span>
        <span className="block text-muted text-[11.5px] leading-[1.5] mt-0.5">
          {data ? `${data.meta} · ${data.rank}.º de ${data.of}` : noData}
        </span>
      </>
    ),
  };
}

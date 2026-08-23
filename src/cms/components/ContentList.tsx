import Link from "next/link";
import { depthOf } from "@/content-system/hierarchy";
import { cn } from "@/lib/cn";
import { formatContentDateTimeShort } from "@/lib/content-date";
import { actorLabel, type HistoryActor } from "../history";
import {
  cmsListHref,
  type CmsListQuery,
  type CmsSortColumn,
  sortedContentRows,
  toggleSort,
} from "../listQuery";
import type { CmsSection } from "../sections";
import { cmsEditPath, publicSectionPath } from "../sections";
import type { CmsContentSummary } from "../types";
import { StatusChip, WorkingCopyIndicator } from "./StatusChip";

// A section's pages, as the tree rather than a flat list.
//
// Uniform across sections (cms.md): guides are all top level today and render as
// a flat list because that is what their tree *is*, not because this component
// checks which section it is showing.

export function ContentList({
  section,
  pages,
  actors,
  basePath,
  query,
  emptyMessage,
}: {
  section: CmsSection;
  pages: readonly CmsContentSummary[];
  /** The accounts behind `createdBy`/`updatedBy`, resolved by the route. */
  actors: ReadonlyMap<string, HistoryActor>;
  basePath: string;
  query: CmsListQuery;
  emptyMessage: string;
}) {
  if (pages.length === 0) {
    return (
      <p className="font-mono text-[14px] leading-[1.7] text-muted border border-line border-dashed px-5 py-8 text-center">
        {emptyMessage}
      </p>
    );
  }

  // The tree is built from whatever survived the filters, then ordered by the
  // sorted column. A child whose parent was filtered out still shows, at its
  // own depth — losing it silently would be worse than showing it out of
  // context.
  const ordered = sortedContentRows(pages, query.sort);

  const sortHeader = (column: CmsSortColumn, label: string) => (
    <SortableTh
      href={cmsListHref(basePath, {
        ...query,
        sort: toggleSort(query.sort, column),
      })}
      label={label}
      active={query.sort.column === column}
      direction={query.sort.direction}
    />
  );

  return (
    <table className="w-full border-collapse font-mono text-[13px]">
      <thead>
        <tr>
          <Th>Página</Th>
          <Th className="w-[130px]">Estado</Th>
          {sortHeader("creada", "Creada")}
          {sortHeader("editada", "Última edición")}
        </tr>
      </thead>
      <tbody>
        {ordered.map((page) => (
          <tr key={page.id} className="border-b border-line/60">
            <td className="py-3 pr-4 align-top">
              {/* Indented by path depth, so a hub and its children read as a
                  tree without a second column of tree glyphs. */}
              <span
                style={{ paddingLeft: `${(depthOf(page.slug) - 1) * 18}px` }}
                className="block"
              >
                <Link
                  href={cmsEditPath(section.id, page.id)}
                  className="text-ink no-underline hover:text-accent"
                >
                  {page.title || <em className="text-muted">Sin título</em>}
                </Link>
                <span className="block text-muted text-[12px] mt-0.5">
                  {publicSectionPath(section.id)}/{page.slug}
                </span>
                {/* A row whose stored metadata no longer matches its schema.
                    It still lists and still opens — that is the whole point of
                    the CMS's lenient read — but it says so, because its fields
                    will look empty in the editor and that would otherwise read
                    as data loss rather than as a page needing repair. */}
                {page.metadataError && (
                  <span className="block text-[var(--vendor-ochre)] text-[12px] mt-0.5">
                    Metadatos ilegibles — abre la página para volver a
                    completarlos.
                  </span>
                )}
              </span>
            </td>
            <td className="py-3 pr-4 align-top">
              <StatusChip status={page.status} />
              {/* A saved working copy is distinct from the page's lifecycle
                  status. Draft pages already say "Borrador" above; the extra
                  line is for a published/preview page whose newer copy is not
                  public yet. */}
              {page.hasWip && page.status !== "draft" && (
                <WorkingCopyIndicator />
              )}
            </td>
            <Stamp at={page.createdAt} by={page.createdBy} actors={actors} />
            <Stamp
              at={page.updatedAt}
              by={page.updatedBy}
              actors={actors}
              last
            />
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** One timestamp cell: when, on one line, and who underneath it. The short
 * date is what buys the second line — the long form already filled two. */
function Stamp({
  at,
  by,
  actors,
  last,
}: {
  at: string;
  by: string | null;
  actors: ReadonlyMap<string, HistoryActor>;
  last?: boolean;
}) {
  return (
    <td
      className={cn(
        "py-3 align-top text-muted hidden md:table-cell whitespace-nowrap",
        !last && "pr-4",
      )}
    >
      {formatContentDateTimeShort(at)}
      {/* No id means the column was never written — nothing is known about who,
          which is not the same claim as an account having been deleted. */}
      {by && (
        <span className="block text-[12px] mt-0.5 opacity-80">
          {actorLabel(actors.get(by) ?? null)}
        </span>
      )}
    </td>
  );
}

function Th({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      className={`text-left font-medium uppercase text-micro tracking-label-wide text-muted border-b border-line py-2 pr-4 ${className ?? ""}`}
    >
      {children}
    </th>
  );
}

/** A header that is a link, not a button: sorting is URL state, so it works
 * without JavaScript and the sorted view can be shared. */
function SortableTh({
  href,
  label,
  active,
  direction,
}: {
  href: string;
  label: string;
  active: boolean;
  direction: "asc" | "desc";
}) {
  return (
    <th
      aria-sort={
        active ? (direction === "asc" ? "ascending" : "descending") : undefined
      }
      className="w-[170px] text-left font-medium uppercase text-micro tracking-label-wide text-muted border-b border-line py-2 pr-4 hidden md:table-cell whitespace-nowrap"
    >
      <Link
        href={href}
        className={cn(
          "inline-flex items-center gap-1.5 no-underline transition-colors hover:text-accent",
          active ? "text-ink" : "text-muted",
        )}
      >
        {label}
        {/* The inactive arrow is drawn too, at low contrast: a column that only
            shows it once sorted gives no hint that it can be. */}
        <span aria-hidden="true" className={cn(!active && "opacity-30")}>
          {active && direction === "asc" ? "↑" : "↓"}
        </span>
      </Link>
    </th>
  );
}

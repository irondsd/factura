import Link from "next/link";
import type { AuthorRef } from "@/content-system/authors/types";
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
import { CmsIcon } from "../icons";
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
  authors,
  basePath,
  query,
  emptyMessage,
}: {
  section: CmsSection;
  pages: readonly CmsContentSummary[];
  /** The accounts behind `createdBy`/`updatedBy`, resolved by the route. */
  actors: ReadonlyMap<string, HistoryActor>;
  /** The credited people behind `authorId`/`factCheckerId`, resolved by the
   * route. An id nothing matches is simply absent, and the row then credits
   * nobody — the same answer as a page that never named one. */
  authors: ReadonlyMap<string, AuthorRef>;
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

  const sortHeader = (
    column: CmsSortColumn,
    label: string,
    className?: string,
  ) => (
    <SortableTh
      href={cmsListHref(basePath, {
        ...query,
        sort: toggleSort(query.sort, column),
      })}
      label={label}
      active={query.sort.column === column}
      direction={query.sort.direction}
      className={className}
    />
  );

  return (
    // Fixed layout, so the title column is whatever is left over rather than
    // whatever the longest title asks for. Without it a cell cannot be
    // truncated at all: an auto-laid-out table sizes each column to its widest
    // content, so `truncate` on the title would just widen the column instead
    // of clipping — which is how the titles came to wrap onto three lines.
    <table className="w-full table-fixed border-collapse font-mono text-[13px]">
      <thead>
        <tr>
          <Th>Página</Th>
          {/* Wide enough for «Vista previa» on one line: the fixed layout
              hands each column exactly what is declared here, and a status that
              wraps makes its row taller than every other cell in it. */}
          <Th className="cms-column-status w-[150px]">Estado</Th>
          {/* Not sortable, and not for want of a comparator: sorting a list by
              who signed it groups a section around one name, which is a filter
              someone would want, not an order. The header stays a plain label
              rather than offering an arrow it would answer badly. */}
          <Th className="cms-column-credits w-[190px] hidden lg:table-cell">
            Créditos
          </Th>
          {sortHeader("creada", "Creada", "cms-column-created")}
          {sortHeader("editada", "Última edición", "cms-column-updated")}
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
                {/* One line each from `md` up, clipped with an ellipsis: a
                    wrapped title pushed its row to three lines and pulled every
                    other column in it out of alignment, which cost more
                    scanning than the tail of a long title was worth. Both carry
                    the full text as a tooltip — `title` is the only mechanism
                    the browser offers, so it shows whether or not anything was
                    actually clipped.

                    Below `md` they wrap instead. That is the one width where
                    the title column is narrow *and* there is no pointer to
                    hover with, so clipping there would hide the text outright
                    rather than fold it away. */}
                <Link
                  href={cmsEditPath(section.id, page.id)}
                  title={page.title || undefined}
                  className="block overflow-hidden text-ellipsis md:whitespace-nowrap text-ink no-underline hover:text-accent"
                >
                  {page.title || <em className="text-muted">Sin título</em>}
                </Link>
                <span
                  title={`${publicSectionPath(section.id)}/${page.slug}`}
                  className="block overflow-hidden text-ellipsis md:whitespace-nowrap text-muted text-[12px] mt-0.5"
                >
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
            <td className="cms-column-status py-3 pr-4 align-top">
              <StatusChip status={page.status} />
              {/* A saved working copy is distinct from the page's lifecycle
                  status. Draft pages already say "Borrador" above; the extra
                  line is for a published/preview page whose newer copy is not
                  public yet. */}
              {page.hasWip && page.status !== "draft" && (
                <WorkingCopyIndicator />
              )}
            </td>
            <Credits metadata={page.metadata} authors={authors} />
            <Stamp
              at={page.createdAt}
              by={page.createdBy}
              actors={actors}
              className="cms-column-created"
            />
            <Stamp
              at={page.updatedAt}
              by={page.updatedBy}
              actors={actors}
              last
              className="cms-column-updated"
            />
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Who signed the page and who checked it, two lines in one cell.
 *
 * Names only, with an icon each, because that is what a scan of the column is
 * for — «which of these did Daria check?» is answered by the names alone, and
 * spelling out «Autor:» on every row would double the width of the column to
 * repeat a fact the icon already carries. The words are still there for anyone
 * who needs them: on hover as a tooltip, and always for a screen reader. */
function Credits({
  metadata,
  authors,
}: {
  metadata: { authorId?: string; factCheckerId?: string };
  authors: ReadonlyMap<string, AuthorRef>;
}) {
  const author = metadata.authorId
    ? (authors.get(metadata.authorId) ?? null)
    : null;
  const factChecker = metadata.factCheckerId
    ? (authors.get(metadata.factCheckerId) ?? null)
    : null;

  return (
    <td className="cms-column-credits py-3 pr-4 align-top text-muted hidden lg:table-cell">
      {/* Both credits are optional and most older pages have neither, so the
          empty cell says so with a dash rather than leaving a hole that reads
          as a rendering fault. */}
      {!author && !factChecker && <span aria-hidden="true">—</span>}
      {author && (
        <Credit
          label="Autor"
          name={author.name}
          icon={<CmsIcon name="author" size="xs" />}
        />
      )}
      {factChecker && (
        <Credit
          label="Verificado por"
          name={factChecker.name}
          icon={<CmsIcon name="factCheck" size="xs" />}
          className={cn(author && "mt-1")}
        />
      )}
    </td>
  );
}

function Credit({
  label,
  name,
  icon,
  className,
}: {
  label: string;
  name: string;
  icon: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      title={`${label}: ${name}`}
      className={cn("flex items-center gap-1.5 text-[12px]", className)}
    >
      {icon}
      <span className="sr-only">{label}: </span>
      {/* Capped rather than merely allowed to shrink: the table lays itself out
          from its content, so an unbounded name is a wider column for every
          row. The cap is what the ellipsis is measured against, and the whole
          name is a hover away. */}
      <span className="max-w-[150px] truncate">{name}</span>
    </span>
  );
}

/** One timestamp cell: when, on one line, and who underneath it. The short
 * date is what buys the second line — the long form already filled two. */
function Stamp({
  at,
  by,
  actors,
  last,
  className,
}: {
  at: string;
  by: string | null;
  actors: ReadonlyMap<string, HistoryActor>;
  last?: boolean;
  className?: string;
}) {
  return (
    <td
      className={cn(
        "py-3 align-top text-muted hidden md:table-cell whitespace-nowrap",
        !last && "pr-4",
        className,
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
  className,
}: {
  href: string;
  label: string;
  active: boolean;
  direction: "asc" | "desc";
  className?: string;
}) {
  return (
    <th
      aria-sort={
        active ? (direction === "asc" ? "ascending" : "descending") : undefined
      }
      className={cn(
        "w-[170px] text-left font-medium uppercase text-micro tracking-label-wide text-muted border-b border-line py-2 pr-4 hidden md:table-cell whitespace-nowrap",
        className,
      )}
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
        <CmsIcon
          name={active && direction === "asc" ? "arrowUp" : "arrowDown"}
          size="xs"
          className={cn(!active && "opacity-30")}
        />
      </Link>
    </th>
  );
}

import Link from "next/link";
import { CONTENT_STATUSES, type ContentStatus } from "@/content-system/types";
import { cn } from "@/lib/cn";
import { cmsListHref, type CmsListQuery, isDefaultSort } from "../listQuery";
import { statusLabel } from "./StatusChip";

// Status filter and search, driven by the URL rather than client state.
//
// A filtered list is then bookmarkable and shareable ("the drafts I still owe
// you"), the server does the filtering in the query it was already running, and
// there is no state to get out of step with what is on screen.

export function ListFilters({
  basePath,
  query,
  counts,
  total,
}: {
  basePath: string;
  query: CmsListQuery;
  counts: Record<ContentStatus, number>;
  total: number;
}) {
  // Changing the filter keeps the column sort — they are two independent
  // choices about the same list, and clearing one by touching the other is the
  // kind of thing you only notice after re-sorting for the third time.
  const href = (status?: ContentStatus) =>
    cmsListHref(basePath, { ...query, status });

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-3 mb-6">
      <nav className="flex flex-wrap items-center gap-1">
        <FilterLink
          href={href()}
          active={!query.status}
          label="Todas"
          count={total}
        />
        {CONTENT_STATUSES.map((status) => (
          <FilterLink
            key={status}
            href={href(status)}
            active={query.status === status}
            label={statusLabel(status)}
            count={counts[status]}
          />
        ))}
      </nav>

      {/* A plain GET form: no JavaScript, and the result is a URL. */}
      <form action={basePath} method="get" className="flex items-center gap-2">
        {query.status && (
          <input type="hidden" name="estado" value={query.status} />
        )}
        {/* The sort survives a search for the same reason it survives a filter
            change, and a GET form carries nothing it is not told to. */}
        {!isDefaultSort(query.sort) && (
          <>
            <input type="hidden" name="orden" value={query.sort.column} />
            <input type="hidden" name="dir" value={query.sort.direction} />
          </>
        )}
        <label htmlFor="cms-search" className="sr-only">
          Buscar por título o dirección
        </label>
        <input
          id="cms-search"
          type="search"
          name="q"
          defaultValue={query.search ?? ""}
          placeholder="Buscar…"
          className="border border-line bg-paper px-3 py-1.5 font-mono text-[13px] text-ink placeholder:text-muted focus:border-accent focus:outline-none"
        />
        <button
          type="submit"
          className="border border-line px-3 py-1.5 font-mono text-micro uppercase tracking-label-wide text-muted transition-colors hover:border-accent hover:text-accent"
        >
          Buscar
        </button>
      </form>
    </div>
  );
}

function FilterLink({
  href,
  active,
  label,
  count,
}: {
  href: string;
  active: boolean;
  label: string;
  count: number;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "border px-3 py-1.5 font-mono text-micro uppercase tracking-label-wide no-underline transition-colors",
        active
          ? "border-accent text-accent"
          : "border-transparent text-muted hover:text-accent",
      )}
    >
      {label}
      <span className="ml-2 opacity-70">{count}</span>
    </Link>
  );
}

import Link from "next/link";
import { CONTENT_STATUSES, type ContentStatus } from "@/content-system/types";
import { cn } from "@/lib/cn";
import { cmsListHref, type CmsListQuery } from "../listQuery";
import { statusLabel } from "./StatusChip";

// The status filter, driven by the URL rather than client state.
//
// A filtered list is then bookmarkable and shareable ("the drafts I still owe
// you"), the server does the filtering in the query it was already running, and
// there is no state to get out of step with what is on screen.
//
// A search box used to sit at the other end of this row. It searched titles,
// inside one section, and it is gone: the header search does the same thing
// across every section and through the body as well, so keeping this one would
// have meant two boxes that answer differently — and the narrower of the two is
// the one nearer the results.

export function ListFilters({
  basePath,
  query,
  counts,
  total,
  className,
}: {
  basePath: string;
  query: CmsListQuery;
  counts: Record<ContentStatus, number>;
  total: number;
  className?: string;
}) {
  // Changing the filter keeps the column sort — they are two independent
  // choices about the same list, and clearing one by touching the other is the
  // kind of thing you only notice after re-sorting for the third time.
  const href = (status?: ContentStatus) =>
    cmsListHref(basePath, { ...query, status });

  return (
    <nav className={cn("flex flex-wrap items-center gap-1", className)}>
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
        "inline-flex min-h-11 items-center border px-3 py-1.5 font-mono text-micro uppercase tracking-label-wide no-underline transition-colors sm:min-h-0",
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

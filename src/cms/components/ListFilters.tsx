import Link from "next/link";
import { CONTENT_STATUSES, type ContentStatus } from "@/content-system/types";
import { cn } from "@/lib/cn";
import { statusLabel } from "./StatusChip";

// Status filter and search, driven by the URL rather than client state.
//
// A filtered list is then bookmarkable and shareable ("the drafts I still owe
// you"), the server does the filtering in the query it was already running, and
// there is no state to get out of step with what is on screen.

export type ListFilterState = { status?: ContentStatus; search?: string };

export function ListFilters({
  basePath,
  state,
  counts,
  total,
}: {
  basePath: string;
  state: ListFilterState;
  counts: Record<ContentStatus, number>;
  total: number;
}) {
  const href = (next: ListFilterState) => {
    const params = new URLSearchParams();
    if (next.status) params.set("estado", next.status);
    if (next.search) params.set("q", next.search);
    const query = params.toString();
    return query ? `${basePath}?${query}` : basePath;
  };

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-3 mb-6">
      <nav className="flex flex-wrap items-center gap-1">
        <FilterLink
          href={href({ search: state.search })}
          active={!state.status}
          label="Todas"
          count={total}
        />
        {CONTENT_STATUSES.map((status) => (
          <FilterLink
            key={status}
            href={href({ status, search: state.search })}
            active={state.status === status}
            label={statusLabel(status)}
            count={counts[status]}
          />
        ))}
      </nav>

      {/* A plain GET form: no JavaScript, and the result is a URL. */}
      <form action={basePath} method="get" className="flex items-center gap-2">
        {state.status && (
          <input type="hidden" name="estado" value={state.status} />
        )}
        <label htmlFor="cms-search" className="sr-only">
          Buscar por título o dirección
        </label>
        <input
          id="cms-search"
          type="search"
          name="q"
          defaultValue={state.search ?? ""}
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

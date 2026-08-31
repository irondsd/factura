import Link from "next/link";
import type { ContentStatus } from "@/content-system/types";
import { cn } from "@/lib/cn";
import { CmsIcon } from "../icons";
import {
  filterOptionLabel,
  type CmsFilterOptions,
} from "../listFilterOptions";
import {
  activeCmsFilterKeys,
  clearedCmsFilters,
  cmsListHref,
  type CmsFilterKey,
  type CmsListQuery,
} from "../listQuery";
import { statusLabel } from "./StatusChip";

// What is currently narrowing the list, and how to stop it narrowing.
//
// The badge on the toolbar button says *how many* filters are on; this says
// *which*. That distinction is the whole point on a phone, where the status
// tabs are not on screen and a dialog you have to open to find out why the
// table is empty is a dead end.
//
// Links, not buttons, for the same reason the tabs are: each chip is a URL for
// the list without that one facet, so removing a filter works before any
// JavaScript loads and can be middle-clicked into a new tab like anything else
// in the console.

export function ActiveListFilters({
  basePath,
  query,
  options,
  className,
}: {
  basePath: string;
  query: CmsListQuery;
  options: CmsFilterOptions;
  className?: string;
}) {
  const active = activeCmsFilterKeys(query);
  if (active.length === 0) return null;

  // Every chip in the row can be display-hidden above `sm` — that is exactly
  // the case where status is the only filter — and a bare flex row with nothing
  // in it is still a row of margin. So the row goes with them.
  const onlyStatus = active.length === 1 && active[0] === "status";

  // `label` is the disambiguator, not decoration: «Daria Lubim» could be either
  // credit, so those chips need naming. A chip whose value already says what it
  // is gets none — «Borrador guardado: Con cambios sin publicar» is the same
  // sentence twice, and on a phone it is the one that wraps.
  const describe = (
    facet: CmsFilterKey,
  ): { label?: string; value: string } => {
    switch (facet) {
      case "status":
        return {
          label: "Estado",
          value: statusLabel(query.status as ContentStatus),
        };
      case "authorId":
        return {
          label: "Autor",
          value: filterOptionLabel(options.authors, query.authorId ?? ""),
        };
      case "factCheckerId":
        return {
          label: "Verificado por",
          value: filterOptionLabel(
            options.factCheckers,
            query.factCheckerId ?? "",
          ),
        };
      case "category":
        return {
          label: "Categoría",
          value: filterOptionLabel(options.categories, query.category ?? ""),
        };
      case "location":
        return {
          label: "Ubicación",
          value: filterOptionLabel(options.locations, query.location ?? ""),
        };
      case "unpublishedChanges":
        return {
          value: query.unpublishedChanges
            ? "Con cambios sin publicar"
            : "Sin cambios pendientes",
        };
    }
  };

  return (
    <div
      className={cn(
        "mb-4 flex flex-wrap items-center gap-2",
        onlyStatus && "sm:hidden",
        className,
      )}
      aria-label="Filtros activos"
    >
      {active.map((facet) => {
        const { label, value } = describe(facet);
        return (
          <Link
            key={facet}
            href={cmsListHref(basePath, { ...query, [facet]: undefined })}
            title={`Quitar el filtro ${label ? `${label}: ` : ""}${value}`}
            className={cn(
              "inline-flex min-h-8 max-w-full items-center gap-2 border border-line px-2.5 py-1 font-mono text-[12px] text-ink no-underline transition-colors hover:border-accent hover:text-accent",
              // The status chip is the one duplicate: above `sm` the tabs above
              // the table already show it, highlighted, and a chip repeating it
              // would be the same fact twice in the same eyeful.
              facet === "status" && "sm:hidden",
            )}
          >
            {label && (
              <span className="shrink-0 whitespace-nowrap text-muted">
                {label}:
              </span>
            )}
            <span className="min-w-0 truncate">{value}</span>
            <CmsIcon name="close" size="xs" className="shrink-0 text-muted" />
          </Link>
        );
      })}

      {active.length > 1 && (
        <Link
          href={cmsListHref(basePath, clearedCmsFilters(query))}
          className="inline-flex min-h-8 items-center px-2 py-1 font-mono text-micro uppercase tracking-label-wide text-muted no-underline transition-colors hover:text-accent"
        >
          Limpiar todo
        </Link>
      )}
    </div>
  );
}

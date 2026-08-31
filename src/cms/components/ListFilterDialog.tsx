"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CONTENT_STATUSES, type ContentStatus } from "@/content-system/types";
import { cn } from "@/lib/cn";
import { CmsIcon } from "../icons";
import type { CmsFilterOption, CmsFilterOptions } from "../listFilterOptions";
import {
  clearedCmsFilters,
  cmsListHref,
  countActiveCmsFilters,
  type CmsListQuery,
} from "../listQuery";
import { CmsModal, DialogButton, DialogCancel } from "./CmsDialog";
import { CmsSelect } from "./fields/controls";
import { statusLabel } from "./StatusChip";

// Every way of narrowing a section's list, in one dialog.
//
// The status tabs answered one question well and were the only question anyone
// could ask, so «¿qué escribió Daria que todavía no publicamos?» meant reading
// the whole table. The other facets are all already on the row — the credits
// column, the working-copy line — and a column you can see but not filter by is
// an invitation to scroll.
//
// It is a dialog rather than a row of dropdowns because of the phone: six
// controls do not fit next to a table on a 375px screen, and the ones that
// mattered were the first to wrap off it. On desktop the status tabs stay
// where they were and this holds the rest.
//
// The state is the URL, like the tabs before it — bookmarkable, shareable,
// survives a refresh, and there is no second copy of "what is on screen".
// What is *local* is the pending selection: the dialog collects a whole
// combination and «Aplicar» navigates once, so choosing four facets is one
// server round trip rather than four, and «Cancelar» genuinely cancels.

export function ListFilterDialog({
  basePath,
  query,
  options,
  statusCounts,
  total,
}: {
  basePath: string;
  query: CmsListQuery;
  options: CmsFilterOptions;
  statusCounts: Record<ContentStatus, number>;
  total: number;
}) {
  const [open, setOpen] = useState(false);
  const active = countActiveCmsFilters(query);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={
          active > 0 ? `Filtros (${active} activos)` : "Filtrar la lista"
        }
        title="Filtrar la lista"
        className={cn(
          "relative inline-flex size-9 shrink-0 cursor-pointer items-center justify-center border bg-paper transition-colors hover:border-accent hover:text-accent focus-visible:border-accent focus-visible:text-accent focus-visible:outline-none",
          // A filter that is on has to say so from the toolbar: the tabs are
          // gone on a phone, and an empty-looking list with no visible cause is
          // the failure this badge exists to prevent.
          active > 0 ? "border-accent text-accent" : "border-line text-muted",
        )}
      >
        <CmsIcon name="filter" size="sm" />
        {active > 0 && (
          <span
            aria-hidden="true"
            className="absolute -right-1.5 -top-1.5 inline-flex size-4 items-center justify-center border border-accent bg-accent font-mono text-[10px] leading-none text-paper"
          >
            {active}
          </span>
        )}
      </button>

      {/* Mounted conditionally, so the pending selection starts from the URL
          every time it opens rather than from whatever was abandoned last. */}
      {open && (
        <FilterForm
          basePath={basePath}
          query={query}
          options={options}
          statusCounts={statusCounts}
          total={total}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function FilterForm({
  basePath,
  query,
  options,
  statusCounts,
  total,
  onClose,
}: {
  basePath: string;
  query: CmsListQuery;
  options: CmsFilterOptions;
  statusCounts: Record<ContentStatus, number>;
  total: number;
  onClose: () => void;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<CmsListQuery>(query);
  // The navigation is the work, so the dialog waits for it: closing on the
  // click would drop the editor back on the unfiltered table with nothing
  // saying a new one is on its way. Inside the transition, the close commits
  // with the list it asked for.
  const [pending, startTransition] = useTransition();

  const apply = (next: CmsListQuery) =>
    startTransition(() => {
      router.push(cmsListHref(basePath, next));
      onClose();
    });

  const set = <K extends keyof CmsListQuery>(key: K, value: CmsListQuery[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  return (
    <CmsModal
      eyebrow="Vista de la sección"
      title="Filtrar páginas"
      busy={pending}
      onClose={onClose}
      width="440px"
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          apply(draft);
        }}
      >
        {/* Above `sm` the tabs behind this dialog are already showing the
            state and are one click away, so repeating it here would be two
            controls for one choice on the screen that has room for neither
            confusion. */}
        <div className="sm:hidden">
          <FilterField label="Estado">
            <CmsSelect
              value={draft.status ?? ""}
              onChange={(event) =>
                set(
                  "status",
                  (event.target.value || undefined) as
                    | ContentStatus
                    | undefined,
                )
              }
            >
              <option value="">Todas ({total})</option>
              {CONTENT_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {statusLabel(status)} ({statusCounts[status]})
                </option>
              ))}
            </CmsSelect>
          </FilterField>
        </div>

        <OptionField
          label="Autor"
          anyLabel="Cualquier autor"
          options={options.authors}
          value={draft.authorId}
          onChange={(value) => set("authorId", value)}
        />
        <OptionField
          label="Verificado por"
          anyLabel="Cualquier verificador"
          options={options.factCheckers}
          value={draft.factCheckerId}
          onChange={(value) => set("factCheckerId", value)}
        />
        <OptionField
          label="Categoría"
          anyLabel="Cualquier categoría"
          options={options.categories}
          value={draft.category}
          onChange={(value) => set("category", value)}
        />
        <OptionField
          label="Ubicación"
          anyLabel="Cualquier ubicación"
          options={options.locations}
          value={draft.location}
          onChange={(value) => set("location", value)}
        />

        <FilterField
          label="Borrador guardado"
          help="Páginas ya publicadas con una versión más nueva sin publicar."
        >
          <CmsSelect
            value={
              draft.unpublishedChanges === undefined
                ? ""
                : draft.unpublishedChanges
                  ? "si"
                  : "no"
            }
            onChange={(event) =>
              set(
                "unpublishedChanges",
                event.target.value === ""
                  ? undefined
                  : event.target.value === "si",
              )
            }
          >
            <option value="">Indistinto</option>
            <option value="si">Con cambios sin publicar</option>
            <option value="no">Sin cambios pendientes</option>
          </CmsSelect>
        </FilterField>

        <div className="mt-6 flex flex-wrap items-center gap-2">
          <DialogButton
            tone="accent"
            type="submit"
            icon="filter"
            disabled={pending}
          >
            {pending ? "…" : "Aplicar"}
          </DialogButton>
          {/* Clears the pending selection rather than navigating: the editor
              is still in the dialog, and «Aplicar» is what commits either way. */}
          <button
            type="button"
            onClick={() => setDraft(clearedCmsFilters(draft))}
            disabled={pending || countActiveCmsFilters(draft) === 0}
            className="cursor-pointer border border-dashed border-line px-3 py-2 font-mono text-micro uppercase tracking-label-wide text-muted transition-colors hover:border-ink hover:text-ink disabled:cursor-not-allowed disabled:opacity-45"
          >
            Limpiar
          </button>
          <DialogCancel onClick={onClose} disabled={pending} />
        </div>
      </form>
    </CmsModal>
  );
}

/** One facet backed by a registry. Rendered only when the section has
 * something to offer — a dropdown whose only entry is «Cualquier autor» is a
 * control that cannot do anything — unless a filter is already set on it, in
 * which case it has to stay so it can be released. */
function OptionField({
  label,
  anyLabel,
  options,
  value,
  onChange,
}: {
  label: string;
  anyLabel: string;
  options: readonly CmsFilterOption[];
  value: string | undefined;
  onChange: (value: string | undefined) => void;
}) {
  if (options.length === 0 && !value) return null;

  // A value the options don't cover — a hand-edited URL, a retired registry
  // entry — is offered as itself so the select shows what is actually filtering
  // rather than silently snapping back to «cualquiera».
  const orphan = value && !options.some((option) => option.value === value);

  return (
    <FilterField label={label}>
      <CmsSelect
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value || undefined)}
      >
        <option value="">{anyLabel}</option>
        {orphan && <option value={value}>{value}</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label} ({option.count})
          </option>
        ))}
      </CmsSelect>
    </FilterField>
  );
}

function FilterField({
  label,
  help,
  children,
}: {
  label: string;
  help?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="mt-5 block">
      <span className="mb-1 block font-mono text-micro uppercase tracking-label-wide text-muted">
        {label}
      </span>
      {children}
      {help && (
        <span className="mt-1 block font-mono text-[12px] leading-[1.5] text-muted">
          {help}
        </span>
      )}
    </label>
  );
}

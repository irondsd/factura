"use client";

import { useState, type ReactNode } from "react";
import type { ContentSection } from "@/content-system/types";
import { cn } from "@/lib/cn";
import { CmsModal, DialogCancel } from "./CmsDialog";
import { CmsIcon } from "../icons";
import {
  contentColumnsForSection,
  moveContentColumn,
  resolveColumnOrder,
  saveColumnPreferences,
  type ColumnMoveDirection,
} from "../columnPreferences";
import { useContentColumnPreferences } from "./useContentColumnPreferences";

export function ContentColumnSettings({
  section,
  sectionLabel,
  filters,
  actions,
  children,
}: {
  section: ContentSection;
  sectionLabel: string;
  filters: ReactNode;
  /** Controls that belong beside the column button — the filter dialog's
   * trigger. They share the toolbar rather than getting a row of their own:
   * both are square icon buttons that act on the same table, and splitting them
   * across two lines would read as two unrelated toolbars. */
  actions?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const preferences = useContentColumnPreferences(section);
  const orderedColumns = resolveColumnOrder(section, preferences);
  const definitions = contentColumnsForSection(section);
  const definitionById = new Map<string, (typeof definitions)[number]>(
    definitions.map((column) => [column.id, column]),
  );

  const toggleColumn = (columnId: string) => {
    const nextHidden = preferences.hidden.includes(columnId)
      ? preferences.hidden.filter((item) => item !== columnId)
      : [...preferences.hidden, columnId];

    saveColumnPreferences(section, {
      version: preferences.version,
      hidden: nextHidden,
      placements: { ...preferences.placements },
    });
  };

  const moveColumn = (columnId: string, direction: ColumnMoveDirection) => {
    saveColumnPreferences(
      section,
      moveContentColumn(section, preferences, columnId, direction),
    );
  };

  return (
    <>
      <div className="mb-6 flex min-w-0 items-start justify-between gap-3 sm:gap-4">
        <div className="min-w-0">{filters}</div>
        <div className="flex shrink-0 items-center gap-2">
          {actions}
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Elegir columnas"
            title="Elegir columnas"
            className="inline-flex size-9 shrink-0 cursor-pointer items-center justify-center border border-line bg-paper text-muted transition-colors hover:border-accent hover:text-accent focus-visible:border-accent focus-visible:text-accent focus-visible:outline-none"
          >
            <CmsIcon name="settings" size="sm" />
          </button>
        </div>
      </div>

      {children}

      {open && (
        <CmsModal
          eyebrow="Vista de la sección"
          title="Columnas visibles"
          onClose={() => setOpen(false)}
        >
          <p className="mt-3 mb-0 font-mono text-[13px] leading-[1.6] text-muted">
            Usa las flechas para cambiar el orden. Esta selección se guarda en
            este navegador solo para {sectionLabel}.
          </p>

          <fieldset className="mt-5 border-0 p-0">
            <legend className="sr-only">Columnas de la tabla</legend>
            {orderedColumns.map((columnId, index) => {
              const column = definitionById.get(columnId);
              if (!column) return null;

              return (
                <ColumnChoice
                  key={column.id}
                  label={column.label}
                  checked={!preferences.hidden.includes(column.id)}
                  disabled={column.locked === true}
                  canMoveUp={index > 1}
                  canMoveDown={index < orderedColumns.length - 1}
                  onChange={() => toggleColumn(column.id)}
                  onMoveUp={() => moveColumn(column.id, "up")}
                  onMoveDown={() => moveColumn(column.id, "down")}
                />
              );
            })}
          </fieldset>

          <div className="mt-6 flex">
            <DialogCancel onClick={() => setOpen(false)}>Cerrar</DialogCancel>
          </div>
        </CmsModal>
      )}
    </>
  );
}

function ColumnChoice({
  label,
  checked,
  disabled = false,
  canMoveUp = false,
  canMoveDown = false,
  onChange,
  onMoveUp,
  onMoveDown,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  onChange?: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}) {
  return (
    <div
      className={cn(
        "flex min-h-11 items-center gap-3 border-b border-line/70 py-2 font-mono text-[13px] first:border-t",
        disabled ? "text-muted" : "text-ink",
      )}
    >
      <label
        className={cn(
          "flex min-w-0 flex-1 items-center gap-3",
          disabled ? "cursor-not-allowed" : "cursor-pointer",
        )}
      >
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={onChange}
          className="size-4 accent-[var(--accent)]"
        />
        <span>{label}</span>
      </label>
      {disabled && (
        <span className="ml-auto text-micro uppercase tracking-label-wide opacity-70">
          Siempre visible
        </span>
      )}
      {!disabled && (
        <div className="ml-auto flex flex-col shrink-0 items-center">
          <button
            type="button"
            onClick={onMoveUp}
            disabled={!canMoveUp}
            aria-label={`Subir ${label}`}
            title={`Subir ${label}`}
            className="cursor-pointer w-10 h-5 inline-flex items-center justify-center border border-transparent text-muted transition-colors hover:border-accent hover:text-accent focus-visible:border-accent focus-visible:text-accent focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-30"
          >
            <CmsIcon name="arrowUp" size="xs" />
          </button>
          <button
            type="button"
            onClick={onMoveDown}
            disabled={!canMoveDown}
            aria-label={`Bajar ${label}`}
            title={`Bajar ${label}`}
            className="cursor-pointer w-10 h-5 inline-flex items-center justify-center border border-transparent text-muted transition-colors hover:border-accent hover:text-accent focus-visible:border-accent focus-visible:text-accent focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-30"
          >
            <CmsIcon name="arrowDown" size="xs" />
          </button>
        </div>
      )}
    </div>
  );
}

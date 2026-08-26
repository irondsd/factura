"use client";

import {
  useCallback,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type { ContentSection } from "@/content-system/types";
import { cn } from "@/lib/cn";
import { CmsModal, DialogCancel } from "./CmsDialog";

const OPTIONAL_COLUMNS = [
  { id: "status", label: "Estado" },
  { id: "credits", label: "Créditos" },
  { id: "created", label: "Creada" },
  { id: "updated", label: "Última edición" },
] as const;

type OptionalColumn = (typeof OPTIONAL_COLUMNS)[number]["id"];

const columnIds = new Set<OptionalColumn>(
  OPTIONAL_COLUMNS.map((column) => column.id),
);

const PREFERENCES_CHANGED_EVENT = "factura:cms-columns-changed";
const memoryPreferences = new Map<ContentSection, string>();
const serverSnapshot = () => null;

export function columnSettingsStorageKey(section: ContentSection) {
  return `factura.cms.columns.${section}`;
}

/** Stored preferences are deliberately a list of hidden columns. A column
 * introduced after the preference was saved is therefore visible by default. */
export function parseHiddenColumns(value: string | null): OptionalColumn[] {
  if (!value) return [];

  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is OptionalColumn =>
        typeof item === "string" && columnIds.has(item as OptionalColumn),
    );
  } catch {
    return [];
  }
}

export function ContentColumnSettings({
  section,
  sectionLabel,
  filters,
  children,
}: {
  section: ContentSection;
  sectionLabel: string;
  filters: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  const subscribe = useCallback((notify: () => void) => {
    window.addEventListener("storage", notify);
    window.addEventListener(PREFERENCES_CHANGED_EVENT, notify);
    return () => {
      window.removeEventListener("storage", notify);
      window.removeEventListener(PREFERENCES_CHANGED_EVENT, notify);
    };
  }, []);

  const getSnapshot = useCallback(() => {
    try {
      return (
        localStorage.getItem(columnSettingsStorageKey(section)) ??
        memoryPreferences.get(section) ??
        null
      );
    } catch {
      return memoryPreferences.get(section) ?? null;
    }
  }, [section]);

  const storedPreference = useSyncExternalStore(
    subscribe,
    getSnapshot,
    serverSnapshot,
  );
  const hiddenColumns = parseHiddenColumns(storedPreference);

  const toggleColumn = (column: OptionalColumn) => {
    const next = hiddenColumns.includes(column)
      ? hiddenColumns.filter((item) => item !== column)
      : [...hiddenColumns, column];
    const serialized = JSON.stringify(next);

    // Keep an in-memory copy too: storage can be unavailable in a locked-down
    // browser, but the choice should still apply for the current visit.
    memoryPreferences.set(section, serialized);
    try {
      localStorage.setItem(columnSettingsStorageKey(section), serialized);
    } catch {
      // Persistence is the only part lost when local storage is unavailable.
    }
    window.dispatchEvent(new Event(PREFERENCES_CHANGED_EVENT));
  };

  return (
    <>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="min-w-0">{filters}</div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Elegir columnas"
          title="Elegir columnas"
          className="inline-flex size-[34px] shrink-0 cursor-pointer items-center justify-center border border-line bg-paper text-muted transition-colors hover:border-accent hover:text-accent focus-visible:border-accent focus-visible:text-accent focus-visible:outline-none"
        >
          <GearIcon />
        </button>
      </div>

      <div
        className={cn(
          hiddenColumns.includes("status") && "[&_.cms-column-status]:hidden",
          hiddenColumns.includes("credits") && "[&_.cms-column-credits]:hidden",
          hiddenColumns.includes("created") && "[&_.cms-column-created]:hidden",
          hiddenColumns.includes("updated") && "[&_.cms-column-updated]:hidden",
        )}
      >
        {children}
      </div>

      {open && (
        <CmsModal
          eyebrow="Vista de la sección"
          title="Columnas visibles"
          onClose={() => setOpen(false)}
        >
          <p className="mt-3 mb-0 font-mono text-[13px] leading-[1.6] text-muted">
            Esta selección se guarda en este navegador solo para {sectionLabel}.
          </p>

          <fieldset className="mt-5 border-0 p-0">
            <legend className="sr-only">Columnas de la tabla</legend>
            <ColumnChoice label="Página" checked disabled />
            {OPTIONAL_COLUMNS.map((column) => (
              <ColumnChoice
                key={column.id}
                label={column.label}
                checked={!hiddenColumns.includes(column.id)}
                onChange={() => toggleColumn(column.id)}
              />
            ))}
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
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange?: () => void;
}) {
  return (
    <label
      className={cn(
        "flex min-h-11 items-center gap-3 border-b border-line/70 py-2 font-mono text-[13px] first:border-t",
        disabled ? "cursor-not-allowed text-muted" : "cursor-pointer text-ink",
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
      {disabled && (
        <span className="ml-auto text-micro uppercase tracking-label-wide opacity-70">
          Siempre visible
        </span>
      )}
    </label>
  );
}

function GearIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeLinecap="square"
      strokeLinejoin="miter"
      strokeWidth="1.25"
    >
      <circle cx="10" cy="10" r="2.4" />
      <path
        transform="translate(0 .9)"
        d="M8.6 2.5h2.8l.5 2a6 6 0 0 1 1.2.7l2-.6L16.5 7l-1.5 1.4a6 6 0 0 1 0 1.4l1.5 1.4-1.4 2.4-2-.6a6 6 0 0 1-1.2.7l-.5 2H8.6l-.5-2a6 6 0 0 1-1.2-.7l-2 .6-1.4-2.4L5 9.8a6 6 0 0 1 0-1.4L3.5 7l1.4-2.4 2 .6a6 6 0 0 1 1.2-.7l.5-2Z"
      />
    </svg>
  );
}

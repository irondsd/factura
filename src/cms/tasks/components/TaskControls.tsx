"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { Input } from "@/components/ui";
import { cn } from "@/lib/cn";
import { TaskDescriptionEditor } from "./TaskDescriptionEditor";
import { TASK_TAGS, type TaskTag } from "../types";
import { TAG_LABELS } from "../labels";
import { TAG_SWATCH } from "../display";

export { STATUS_LABELS, TAG_LABELS, BOARD_STATUSES } from "../labels";

const CAPTION =
  "font-mono text-[10px] uppercase tracking-[0.14em] text-muted";

/** The design system's toggle pill: muted label at rest, inverted when on. */
export function Pill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "cursor-pointer border-none px-3 py-1.5 font-mono text-micro uppercase tracking-label transition-colors",
        active ? "bg-ink text-paper" : "bg-transparent text-muted hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}

/** The page top shared by the board, the archive and a task: an optional back
 * label, the accent eyebrow, the display title, and room for actions. */
export function TaskHeading({
  back,
  eyebrow,
  title,
  actions,
  children,
}: {
  back?: { href: string; label: string };
  eyebrow: string;
  title: string;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-6">
      <div className="flex min-w-0 flex-col gap-2.5">
        {back && (
          <Link
            href={back.href}
            className="fd-label mb-3.5 self-start no-underline transition-colors hover:text-ink"
          >
            ‹ {back.label}
          </Link>
        )}
        <span className="fd-label text-accent">{eyebrow}</span>
        <h1 className="m-0 font-display text-[30px] leading-[1.15] font-semibold tracking-[-0.01em] text-pretty [overflow-wrap:anywhere] sm:text-[36px]">
          {title}
        </h1>
        {children && (
          <p className="m-0 max-w-[34rem] text-[13px] text-pretty text-muted">
            {children}
          </p>
        )}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

/** A task's tags as they sit on a card or an archive row. */
export function TaskTagList({ tags }: { tags: TaskTag[] }) {
  if (!tags.length) return null;
  return (
    <div className="flex flex-wrap gap-2.5">
      {tags.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1.5 text-[11px] text-ink"
        >
          <span
            className={cn("size-[7px] flex-none", TAG_SWATCH[tag].fill)}
            aria-hidden="true"
          />
          {TAG_LABELS[tag]}
        </span>
      ))}
    </div>
  );
}

export function TagPicker({
  value,
  onChange,
  disabled,
}: {
  value: TaskTag[];
  onChange: (tags: TaskTag[]) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset className="m-0 flex flex-col gap-2 border-0 p-0" disabled={disabled}>
      <legend className={cn(CAPTION, "mb-2 p-0")}>Etiquetas</legend>
      <div className="flex flex-wrap gap-2">
        {TASK_TAGS.map((tag) => {
          const on = value.includes(tag);
          return (
            <button
              key={tag}
              type="button"
              aria-pressed={on}
              onClick={() =>
                onChange(
                  on ? value.filter((item) => item !== tag) : [...value, tag],
                )
              }
              className={cn(
                "inline-flex cursor-pointer items-center gap-2 border px-3 py-2 font-mono text-xs text-ink transition-colors hover:border-ink disabled:cursor-not-allowed disabled:opacity-50",
                on ? "border-ink bg-card" : "border-line bg-transparent",
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "box-border size-[9px] border-[1.5px]",
                  TAG_SWATCH[tag].border,
                  on ? TAG_SWATCH[tag].fill : "bg-transparent",
                )}
              />
              {TAG_LABELS[tag]}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

/** The Markdown description, highlighted as it is typed. `compact` is the
 * dialog's shorter, paper-coloured variant. */
export function DescriptionEditor({
  value,
  onChange,
  disabled,
  compact = false,
  id = "task-description",
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  compact?: boolean;
  id?: string;
}) {
  const labelId = `${id}-label`;
  return (
    <div className="flex flex-col gap-[5px]">
      <span id={labelId} className={CAPTION}>
        Descripción
      </span>
      <TaskDescriptionEditor
        value={value}
        onChange={onChange}
        disabled={disabled}
        compact={compact}
        labelledBy={labelId}
      />
      <span className="text-[11px] text-muted">
        Markdown: listas, casillas, enlaces y bloques de código.
      </span>
    </div>
  );
}

/** Search and tag filter, mirrored into the URL so a reload or a shared link
 * opens on the same view. `extra` carries other params the page owns (the
 * archive's tab); `null` removes one. */
export function useTaskFilters(
  initial: { search: string; tag?: TaskTag },
  extra: Record<string, string | null> = {},
) {
  const [search, setSearch] = useState(initial.search);
  const [tag, setTag] = useState<TaskTag | undefined>(initial.tag);
  const extraKey = JSON.stringify(extra);

  useEffect(() => {
    const url = new URL(window.location.href);
    const set = (key: string, value: string | null | undefined) => {
      if (value) url.searchParams.set(key, value);
      else url.searchParams.delete(key);
    };
    set("q", search.trim() ? search : null);
    set("tag", tag);
    for (const [key, value] of Object.entries(JSON.parse(extraKey)))
      set(key, value as string | null);
    if (url.href !== window.location.href)
      window.history.replaceState(null, "", url);
  }, [search, tag, extraKey]);

  return {
    search,
    setSearch,
    tag,
    setTag,
    filtering: Boolean(search.trim() || tag),
    clear: () => {
      setSearch("");
      setTag(undefined);
    },
  };
}

/** The ruled strip under a heading: instant search plus the tag pills. */
export function TaskToolbar({
  search,
  onSearch,
  tag,
  onTag,
  children,
}: {
  search: string;
  onSearch: (value: string) => void;
  tag: TaskTag | undefined;
  onTag: (tag: TaskTag | undefined) => void;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-4 border-y border-line py-3">
      <div className="min-w-[200px] flex-[0_1_300px]">
        <Input
          type="search"
          aria-label="Buscar tarea"
          value={search}
          onChange={(event) => onSearch(event.target.value)}
          placeholder="Título o TASK-42"
          maxLength={200}
          className="bg-card! [&::-webkit-search-cancel-button]:appearance-none"
        />
      </div>
      <div
        className="flex flex-wrap items-center gap-1"
        role="group"
        aria-label="Etiqueta"
      >
        <span className="fd-label mr-1.5">Etiqueta</span>
        <Pill active={!tag} onClick={() => onTag(undefined)}>
          Todas
        </Pill>
        {TASK_TAGS.map((value) => (
          <Pill
            key={value}
            active={tag === value}
            onClick={() => onTag(tag === value ? undefined : value)}
          >
            {TAG_LABELS[value]}
          </Pill>
        ))}
      </div>
      {children && (
        <>
          <div className="flex-1" />
          {children}
        </>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
import type { FieldDescriptor } from "@/cms/forms/fields";
import { cn } from "@/lib/cn";
import { CmsIcon } from "../../icons";
import { CmsSelect } from "./controls";
import { asStrings } from "./values";

// «Categorías»: the one to three shelves a page sits on, the first of which
// decides its group in the index and the breadcrumb it shows.
//
// It used to be every category in the section as a row of toggle chips, which
// answered the wrong question: a section with a dozen categories rendered a
// dozen buttons to say that this page is filed under two of them, and the two
// were only findable by their colour. Now the chosen ones are a short list in
// their own order, and choosing another is a menu of what is left — the same
// shape as every other "add one of these" control in the console.

export function CategoriesField({
  field,
  value,
  onChange,
  describedBy,
  invalid,
}: {
  field: FieldDescriptor;
  value: unknown;
  onChange: (next: unknown) => void;
  describedBy?: string;
  invalid?: boolean;
}) {
  const chosen = asStrings(value);
  const options = field.options ?? [];
  const available = options.filter((option) => !chosen.includes(option.value));

  const [draft, setDraft] = useState("");
  // Adding a category takes it out of the menu, so the menu's own selection has
  // to survive that: read back as "nothing chosen" rather than kept in state
  // and reset afterwards.
  const selected = available.some((option) => option.value === draft)
    ? draft
    : "";

  const set = (next: string[]) =>
    onChange(next.length === 0 ? undefined : next);

  const add = () => {
    if (selected === "") return;
    set([...chosen, selected]);
    setDraft("");
  };

  /** Move one category ahead of the one before it. The only reordering there
   * is, and the only one worth having: what «primera» means is a real editorial
   * decision, and without this the way to change it is to remove both and add
   * them back the other way round. */
  const promote = (index: number) => {
    if (index === 0) return;
    const next = [...chosen];
    [next[index - 1], next[index]] = [next[index], next[index - 1]];
    set(next);
  };

  const labelOf = (key: string) =>
    options.find((option) => option.value === key)?.label ?? key;
  const known = (key: string) =>
    options.some((option) => option.value === key) || options.length === 0;

  return (
    <div>
      {chosen.length > 0 && (
        <ul className="list-none p-0 m-0 mb-2 flex flex-col gap-1">
          {chosen.map((key, index) => (
            <li
              key={key}
              className={cn(
                "flex items-center gap-2 border px-2 py-1.5 font-mono text-[12px]",
                known(key)
                  ? "border-line"
                  : "border-[var(--vendor-ochre)] text-[var(--vendor-ochre)]",
              )}
            >
              <span
                className={cn(
                  "text-[10px] uppercase tracking-label-wide shrink-0",
                  index === 0 ? "text-accent" : "text-muted",
                )}
                title={index === 0 ? "Categoría principal" : undefined}
              >
                {index === 0 ? "1ª" : index + 1}
              </span>
              <span className="min-w-0 flex-1 truncate text-ink">
                {labelOf(key)}
              </span>
              {/* A key the section no longer offers. Shown rather than dropped:
                  the validator refuses to publish it, and it can only be fixed
                  by somebody who can see it. */}
              {!known(key) && (
                <span className="shrink-0 text-[10px] uppercase tracking-label-wide">
                  No existe
                </span>
              )}
              {index > 0 && (
                <button
                  type="button"
                  onClick={() => promote(index)}
                  className="shrink-0 text-muted hover:text-accent"
                  aria-label={`Adelantar ${labelOf(key)}`}
                  title="Adelantar"
                >
                  <CmsIcon name="arrowUp" size="xs" />
                </button>
              )}
              <button
                type="button"
                onClick={() => set(chosen.filter((v) => v !== key))}
                className="shrink-0 text-muted hover:text-accent"
                aria-label={`Quitar ${labelOf(key)}`}
              >
                <CmsIcon name="close" size="xs" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {available.length > 0 ? (
        <div className="flex gap-2">
          <CmsSelect
            value={selected}
            aria-describedby={describedBy}
            aria-label="Categoría a añadir"
            aria-invalid={invalid || undefined}
            onChange={(e) => setDraft(e.target.value)}
            className={cn(invalid && "border-[var(--vendor-ochre)]")}
          >
            <option value="">
              {chosen.length === 0 ? "Elige una categoría" : "Añadir otra…"}
            </option>
            {available.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </CmsSelect>
          <button
            type="button"
            onClick={add}
            disabled={selected === ""}
            className="inline-flex items-center gap-2 border border-line px-3 font-mono text-micro uppercase tracking-label-wide text-muted transition-colors hover:border-accent hover:text-accent disabled:cursor-default disabled:opacity-45 disabled:hover:border-line disabled:hover:text-muted"
          >
            <CmsIcon name="add" size="sm" />
            Añadir
          </button>
        </div>
      ) : (
        <p className="font-mono text-[12px] leading-[1.6] text-muted m-0">
          {options.length === 0
            ? "Esta sección todavía no tiene categorías. Créalas en «Categorías» antes de publicar."
            : "Ya están todas las categorías de esta sección."}
        </p>
      )}
    </div>
  );
}

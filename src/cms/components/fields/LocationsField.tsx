"use client";

import { useRef, useState } from "react";
import type { FieldDescriptor } from "@/cms/forms/fields";
import { CmsIcon } from "@/cms/icons";
import { cn } from "@/lib/cn";
import { asStrings } from "./values";

/** Removable chips plus a keyboard-operable autosuggest. Locations are values,
 * not status badges, and their visual order always follows the registry. */
export function LocationsField({
  id,
  field,
  value,
  onChange,
  describedBy,
  invalid,
}: {
  id: string;
  field: FieldDescriptor;
  value: unknown;
  onChange: (next: unknown) => void;
  describedBy?: string;
  invalid?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const options = field.options ?? [];
  const selectedKeys = asStrings(value);
  const selectedSet = new Set(selectedKeys);
  const chosen = [
    ...options.filter((option) => selectedSet.has(option.value)),
    ...selectedKeys
      .filter((key) => !options.some((option) => option.value === key))
      .map((key) => ({ value: key, label: key })),
  ];
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const folded = fold(query);
  const suggestions = options.filter(
    (option) =>
      !selectedSet.has(option.value) &&
      (!folded || fold(option.label).includes(folded) || option.value.includes(folded)),
  );

  const set = (keys: string[]) => onChange(keys.length ? keys : undefined);
  const add = (key: string) => {
    const nextSet = new Set([...selectedKeys, key]);
    set(options.filter((option) => nextSet.has(option.value)).map((option) => option.value)
      .concat([...nextSet].filter((item) => !options.some((option) => option.value === item))));
    setQuery(""); setActive(0); setOpen(false); inputRef.current?.focus();
  };
  const remove = (key: string) => set(selectedKeys.filter((item) => item !== key));
  const listId = `${id}-suggestions`;

  return (
    <div className="relative">
      <div
        className={cn(
          "flex min-h-11 w-full flex-wrap items-center gap-1.5 border bg-paper px-2 py-1.5 transition-colors focus-within:border-accent",
          invalid ? "border-[var(--vendor-ochre)]" : "border-line",
        )}
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) inputRef.current?.focus();
        }}
      >
        {chosen.map((location) => {
          const known = options.some((option) => option.value === location.value);
          return (
            <span
              key={location.value}
              className={cn(
                "inline-flex min-h-8 items-center rounded-sm border bg-card pl-2 font-mono text-[12px] text-ink",
                known ? "border-line" : "border-[var(--vendor-ochre)]",
              )}
            >
              <span>{location.label}</span>
              {!known && <span className="ml-2 text-[9px] tracking-label-wide text-[var(--vendor-ochre)] uppercase">No existe</span>}
              <button
                type="button"
                onClick={() => remove(location.value)}
                className="ml-1 inline-flex min-h-8 min-w-8 items-center justify-center text-muted transition-colors hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent"
                aria-label={`Quitar ${location.label}`}
              >
                <CmsIcon name="close" size="xs" />
              </button>
            </span>
          );
        })}
        <input
          ref={inputRef}
          id={id}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open && suggestions.length > 0}
          aria-controls={listId}
          aria-activedescendant={open && suggestions[active] ? `${listId}-${active}` : undefined}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          value={query}
          placeholder={chosen.length ? "Añadir ubicación…" : "Busca una ubicación…"}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onChange={(event) => { setQuery(event.target.value); setActive(0); setOpen(true); }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" && suggestions.length) { event.preventDefault(); setOpen(true); setActive((value) => (value + 1) % suggestions.length); }
            if (event.key === "ArrowUp" && suggestions.length) { event.preventDefault(); setOpen(true); setActive((value) => (value - 1 + suggestions.length) % suggestions.length); }
            if (event.key === "Enter" && open && suggestions[active]) { event.preventDefault(); add(suggestions[active].value); }
            if (event.key === "Escape") { setOpen(false); }
            if (event.key === "Backspace" && !query && chosen.length) remove(chosen[chosen.length - 1].value);
          }}
          className="min-h-8 min-w-[12ch] flex-1 border-0 bg-transparent px-1 font-mono text-[13.5px] text-ink outline-none placeholder:text-muted"
        />
      </div>

      {open && suggestions.length > 0 && (
        <ul id={listId} role="listbox" className="absolute z-30 mt-1 max-h-60 w-full list-none overflow-auto border border-line bg-paper p-1 shadow-lg">
          {suggestions.map((option, index) => (
            <li
              key={option.value}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === active}
              onMouseDown={(event) => { event.preventDefault(); add(option.value); }}
              onMouseEnter={() => setActive(index)}
              className={cn(
                "cursor-pointer px-3 py-2 font-mono text-[13px] text-ink",
                index === active && "bg-card text-accent",
              )}
            >
              {option.label}
            </li>
          ))}
        </ul>
      )}
      {options.length === 0 && chosen.length === 0 && (
        <p className="mt-2 mb-0 font-mono text-[12px] leading-[1.6] text-muted">Todavía no hay ubicaciones. Créalas desde la portada del CMS antes de publicar.</p>
      )}
    </div>
  );
}

const fold = (value: string) => value.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").trim();

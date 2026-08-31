"use client";

import { useState, type SelectHTMLAttributes } from "react";
import { cn } from "@/lib/cn";
import { CmsIcon } from "../../icons";

// The primitives the console's forms are built out of. Extracted so the four
// metadata fields that grew their own file — keywords, categories, the FAQ, the
// sources — share one input, one counter and one chip list with the plain text
// boxes instead of each restating them, and since `CmsSelect` so that every
// dropdown in the console is the same dropdown.

export const inputClass =
  "w-full border border-line bg-paper px-3 py-2 font-mono text-[13.5px] text-ink placeholder:text-muted focus:border-accent focus:outline-none";

/**
 * The console's dropdown.
 *
 * A bare `<select>` styled with a border was the shape every one of these had,
 * and the browser draws its own arrow hard against the right edge of the box —
 * inside the hairline, ignoring the padding the text gets. Next to the CMS's
 * square, generously-padded fields it read as a rendering fault rather than a
 * control.
 *
 * So the native arrow goes (`appearance-none`) and the chevron is drawn where
 * the rest of the console draws its icons: `CmsIcon`, at the same 12px inset
 * the text sits at, in the same muted tone, following the theme. The select
 * keeps enough right padding that a long option ends before the chevron begins
 * rather than sliding underneath it.
 *
 * `min-h-11` only below `sm`: 44px is the touch target a dropdown on a phone
 * needs, and on a pointer screen the field would be taller than every input
 * beside it for no reason — the same split the status filters use.
 *
 * Everything else is the shared `inputClass`, so a dropdown and the text box
 * above it are the same field with different contents. `className` is appended
 * for the things a caller genuinely varies — an invalid border, a width — and
 * `cn` here is a plain join, so pass additions, not contradictions.
 */
export function CmsSelect({
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    // The wrapper is what the chevron is positioned against, and it is
    // `block w-full` so the control occupies exactly the box the bare `<select>`
    // used to — including as a flex item next to an «Añadir» button.
    <span className="relative block w-full">
      <select
        {...props}
        className={cn(
          inputClass,
          "min-h-11 cursor-pointer appearance-none pr-9 disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-0",
          className,
        )}
      >
        {children}
      </select>
      <CmsIcon
        name="chevronDown"
        size="sm"
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted"
      />
    </span>
  );
}

/** A live character count against the length the guidance is written around.
 * Advisory, not enforcement — the validator owns the rules, and an editor who
 * needs 62 characters should be able to save and see the warning. */
export function Counter({
  value,
  softMax,
}: {
  value: unknown;
  softMax?: number;
}) {
  if (!softMax) return null;
  const length = typeof value === "string" ? value.length : 0;
  const over = length > softMax;
  return (
    <p
      className={cn(
        "font-mono text-[11px] mt-1 mb-0 text-right",
        over ? "text-[var(--vendor-ochre)]" : "text-muted",
      )}
    >
      {length} / {softMax}
      <span className="sr-only">
        {over ? " caracteres, por encima del recomendado" : " caracteres"}
      </span>
    </p>
  );
}

/** A free list of short strings, added one at a time.
 *
 * Used by «Palabras clave» through `KeywordsField`, and directly by the
 * dataset's list of measured variables — which is why it stays a bare control
 * with no heading of its own. */
export function TagsInput({
  value,
  onChange,
  id,
  describedBy,
  /** Marks the first entry as the query the page is written to win. Off for the
   * dataset's variables, where the order means nothing. */
  primaryFirst = false,
  placeholder = "Escribe y pulsa Enter",
}: {
  value: string[];
  onChange: (next: string[]) => void;
  id: string;
  describedBy?: string;
  primaryFirst?: boolean;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState("");

  const add = () => {
    const entry = draft.trim();
    if (entry === "" || value.includes(entry)) return setDraft("");
    onChange([...value, entry]);
    setDraft("");
  };

  return (
    <div>
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-2 list-none p-0 m-0 mb-2">
          {value.map((entry, index) => (
            <li
              key={entry}
              className="flex items-center gap-2 border border-line px-2 py-1 font-mono text-[12px]"
            >
              {primaryFirst && index === 0 && (
                <span
                  className="text-accent text-[10px] uppercase tracking-label-wide"
                  title="Palabra clave principal"
                >
                  1ª
                </span>
              )}
              <span>{entry}</span>
              <button
                type="button"
                onClick={() => onChange(value.filter((v) => v !== entry))}
                className="text-muted hover:text-accent"
                aria-label={`Quitar ${entry}`}
              >
                <CmsIcon name="close" size="xs" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <input
          id={id}
          type="text"
          value={draft}
          aria-describedby={describedBy}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            // Enter adds a keyword; it must not submit the page.
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder={placeholder}
          className={inputClass}
        />
        <button
          type="button"
          onClick={add}
          className="inline-flex items-center gap-2 border border-line px-3 font-mono text-micro uppercase tracking-label-wide text-muted hover:border-accent hover:text-accent"
        >
          <CmsIcon name="add" size="sm" />
          Añadir
        </button>
      </div>
    </div>
  );
}

/** The «Quitar» button every repeated block carries in its header. */
export function RemoveEntry({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="inline-flex items-center gap-1.5 font-mono text-[11px] text-muted hover:text-accent"
    >
      <CmsIcon name="delete" size="xs" />
      Quitar
    </button>
  );
}

/** The «Añadir …» button under a list of repeated blocks. */
export function AddEntry({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-2 border border-line px-3 py-1.5 font-mono text-micro uppercase tracking-label-wide text-muted hover:border-accent hover:text-accent"
    >
      <CmsIcon name="add" size="sm" />
      {children}
    </button>
  );
}

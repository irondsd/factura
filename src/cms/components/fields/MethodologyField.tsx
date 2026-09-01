"use client";

import type { FieldDescriptor } from "@/cms/forms/fields";
import {
  METHODOLOGY_FIELDS,
  type MethodologyKey,
  type MethodologyMetadata,
  methodologyEntries,
} from "@/content-system/types";
import { CollapsibleField } from "./CollapsibleField";
import { inputClass } from "./controls";
import { asMethodology } from "./values";

// «Metodología»: the five lines behind the `<Metodologia />` tag — whose
// numbers, from when, covering what, measuring what, and what they cannot be
// used for.
//
// Not a list, unlike the FAQ and the sources beside it: the set of five is
// fixed, so this is five labelled boxes and the editing is deciding which of
// them this page can answer honestly. Blank ones are dropped rather than stored
// as `""`, so the block draws only what was written and the metadata never
// carries a key nothing renders.
//
// The fold follows *content*, not the tag. Insert `<Metodologia />` into the
// body and the field appears open, because it is empty and there is work to do;
// come back to a page that already says three of the five and it opens folded,
// with the count in the heading — the same bargain the FAQ and the sources
// strike, counted in filled fields instead of entries. `collapseFrom` is the
// number of filled fields from which it starts closed; `1` means "as soon as it
// says anything at all".

/** Two lines each. Every one of these is a sentence, and a single-line input
 * hides the end of "Relevamiento único; no es una serie temporal y no permite
 * medir la evolución de precios." exactly when an editor is judging whether it
 * reads well. */
const ROWS = 2;

const PLACEHOLDERS: Record<MethodologyKey, string> = {
  sources: "Los organismos y series de las que salen las cifras.",
  period: "Qué período cubren los datos, y a qué fecha están.",
  coverage: "Qué territorio, universo o muestra abarcan.",
  metrics: "Qué se mide exactamente, y en qué unidad.",
  limitations: "Qué no permite concluir esta página, dicho sin rodeos.",
};

export function MethodologyField({
  field,
  value,
  onChange,
  required,
  invalid,
}: {
  field: FieldDescriptor;
  value: unknown;
  onChange: (next: unknown) => void;
  required?: boolean;
  invalid?: boolean;
}) {
  const methodology = asMethodology(value);
  const filled = methodologyEntries(methodology).length;
  const collapseFrom = field.collapseFrom ?? Number.POSITIVE_INFINITY;

  return (
    <CollapsibleField
      label={field.label}
      required={required ?? field.required === true}
      help={field.help}
      invalid={invalid}
      summary={
        filled === 0
          ? undefined
          : `${filled} / ${METHODOLOGY_FIELDS.length} campos`
      }
      collapsed={filled >= collapseFrom}
    >
      <MethodologyInput value={methodology} onChange={onChange} />
    </CollapsibleField>
  );
}

function MethodologyInput({
  value,
  onChange,
}: {
  value: MethodologyMetadata;
  onChange: (next: MethodologyMetadata | undefined) => void;
}) {
  // A blank box is an absent key, and an object with no keys is an absent
  // block — the same rule `OgImageInput` follows, and what keeps
  // `metadata.methodology: {}` from ever reaching the database from this form.
  const set = (key: MethodologyKey, text: string) => {
    const next = Object.fromEntries(
      Object.entries({ ...value, [key]: text }).filter(
        ([, entry]) => typeof entry === "string" && entry.trim() !== "",
      ),
    ) as MethodologyMetadata;
    onChange(Object.keys(next).length === 0 ? undefined : next);
  };

  return (
    <div className="grid gap-3">
      {METHODOLOGY_FIELDS.map(({ key, label }) => (
        <label key={key} className="block">
          <span className="mb-1 block font-mono text-[11px] uppercase tracking-label-wide text-muted">
            {label}
          </span>
          <textarea
            rows={ROWS}
            value={value[key] ?? ""}
            onChange={(event) => set(key, event.target.value)}
            placeholder={PLACEHOLDERS[key]}
            className={inputClass}
          />
        </label>
      ))}
    </div>
  );
}

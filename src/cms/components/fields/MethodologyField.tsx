"use client";

import {
  METHODOLOGY_FIELDS,
  type MethodologyKey,
  type MethodologyMetadata,
} from "@/content-system/types";
import { inputClass } from "./controls";

// «Metodología»: the five lines behind the `<Metodologia />` tag — whose
// numbers, from when, covering what, measuring what, and what they cannot be
// used for.
//
// Not a list, unlike the FAQ and the sources beside it: the set of five is
// fixed, so this is five labelled boxes and the editing is deciding which of
// them this page can answer honestly. Blank ones are dropped rather than stored
// as `""`, so the block draws only what was written and the metadata never
// carries a key nothing renders.

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

export function MethodologyInput({
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

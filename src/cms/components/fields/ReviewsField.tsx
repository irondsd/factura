"use client";

import { useState } from "react";
import type { ReviewsMetadata, ReviewSource } from "@/content-system/types";
import { cn } from "@/lib/cn";
import { AddEntry, inputClass, RemoveEntry } from "./controls";

// «Opiniones»: the data behind `<Opiniones />` — each platform's rating of the
// company, copied by hand, and the day it was copied.
//
// The score and the count are typed as text and kept as typed, then stored as
// numbers. A number input would fight a reader of Spanish copy typing «3,4»,
// and a controlled input that re-renders from the stored number would eat the
// comma the moment it was typed. A row whose score does not parse is stored
// without one, which the save refuses with the field named — the same way an
// FAQ entry with no answer is refused.

const LABEL =
  "mb-1 block font-mono text-[11px] uppercase tracking-label-wide text-muted";

type Draft = { score: string; count: string };

const toDraft = (source: ReviewSource): Draft => ({
  score:
    typeof source.score === "number"
      ? String(source.score).replace(".", ",")
      : "",
  count: typeof source.count === "number" ? String(source.count) : "",
});

/** «3,4» or «3.4» → 3.4; anything else → undefined. */
export function parseScore(text: string): number | undefined {
  const value = Number(text.trim().replace(",", "."));
  return text.trim() !== "" && Number.isFinite(value) ? value : undefined;
}

/** «48.210», «48210» or «48 210» → 48210; anything else → undefined. */
export function parseCount(text: string): number | undefined {
  const digits = text.replace(/[.\s]/g, "");
  return /^\d+$/.test(digits) ? Number(digits) : undefined;
}

export function ReviewsInput({
  value,
  onChange,
}: {
  value: ReviewsMetadata;
  onChange: (next: ReviewsMetadata | undefined) => void;
}) {
  const sources = value.sources ?? [];
  const [drafts, setDrafts] = useState<Draft[]>(() => sources.map(toDraft));

  const emit = (nextSources: ReviewSource[], updated = value.updated) =>
    onChange(
      nextSources.length === 0 && !updated
        ? undefined
        : {
            ...(updated ? { updated } : {}),
            sources: nextSources,
          },
    );

  const update = (index: number, patch: Partial<ReviewSource>) =>
    emit(
      sources.map((source, i) => {
        if (i !== index) return source;
        const next = { ...source, ...patch };
        // Optional keys are absent, never `undefined` or `""`.
        for (const key of ["count", "url", "score"] as const) {
          const entry: unknown = next[key];
          if (entry === undefined || entry === "") delete next[key];
        }
        return next;
      }),
    );

  const setDraft = (index: number, patch: Partial<Draft>) =>
    setDrafts((current) =>
      current.map((draft, i) => (i === index ? { ...draft, ...patch } : draft)),
    );

  return (
    <div className="grid gap-4">
      <label className="block">
        <span className={LABEL}>Fecha de los datos</span>
        <input
          type="date"
          value={value.updated ?? ""}
          onChange={(event) => emit(sources, event.target.value || undefined)}
          className={cn(inputClass, "max-w-[220px]")}
        />
        <span className="mt-1 block font-mono text-[11px] text-muted">
          El día en que copiaste las notas. El bloque lo muestra.
        </span>
      </label>

      <div>
        {sources.map((source, index) => (
          <div key={index} className="mb-2 border border-line p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="font-mono text-[11px] uppercase tracking-label-wide text-muted">
                Plataforma {index + 1}
              </span>
              <RemoveEntry
                label={`Quitar la plataforma ${index + 1}`}
                onClick={() => {
                  setDrafts((current) => current.filter((_, i) => i !== index));
                  emit(sources.filter((_, i) => i !== index));
                }}
              />
            </div>
            <input
              type="text"
              value={source.name}
              onChange={(event) => update(index, { name: event.target.value })}
              placeholder="Google Play, Trustpilot…"
              aria-label={`Nombre de la plataforma ${index + 1}`}
              className={cn(inputClass, "mb-2")}
            />
            <div className="mb-2 grid grid-cols-2 gap-2">
              <input
                type="text"
                inputMode="decimal"
                value={drafts[index]?.score ?? ""}
                onChange={(event) => {
                  setDraft(index, { score: event.target.value });
                  update(index, {
                    score: parseScore(event.target.value) as number,
                  });
                }}
                placeholder="Nota: 3,4"
                aria-label={`Nota sobre 5 de la plataforma ${index + 1}`}
                className={inputClass}
              />
              <input
                type="text"
                inputMode="numeric"
                value={drafts[index]?.count ?? ""}
                onChange={(event) => {
                  setDraft(index, { count: event.target.value });
                  update(index, { count: parseCount(event.target.value) });
                }}
                placeholder="Reseñas: 48210"
                aria-label={`Cantidad de reseñas de la plataforma ${index + 1}`}
                className={inputClass}
              />
            </div>
            <input
              type="url"
              value={source.url ?? ""}
              onChange={(event) =>
                update(index, { url: event.target.value || undefined })
              }
              placeholder="https://… (la página de la empresa en esa plataforma)"
              aria-label={`Enlace de la plataforma ${index + 1}`}
              className={inputClass}
            />
          </div>
        ))}
        <AddEntry
          onClick={() => {
            setDrafts((current) => [...current, { score: "", count: "" }]);
            emit([...sources, { name: "" } as ReviewSource]);
          }}
        >
          Añadir plataforma
        </AddEntry>
      </div>
    </div>
  );
}

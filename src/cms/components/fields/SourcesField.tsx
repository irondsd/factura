"use client";

import { cn } from "@/lib/cn";
import { AddEntry, inputClass, RemoveEntry } from "./controls";
import type { Source } from "./values";

// «Fuentes»: the primary documents a page rests on, and the data behind the
// `<Fuentes />` tag in the body. Three inputs per source, edited in
// «Componentes» beside the FAQ.

export function SourcesInput({
  value,
  onChange,
}: {
  value: Source[];
  onChange: (next: Source[] | undefined) => void;
}) {
  const update = (index: number, patch: Partial<Source>) =>
    onChange(
      value.map((source, i) =>
        i === index ? { ...source, ...patch } : source,
      ),
    );

  return (
    <div>
      {value.map((source, index) => (
        <div key={index} className="border border-line p-3 mb-2">
          <div className="flex items-center justify-between mb-2">
            <span className="font-mono text-[11px] uppercase tracking-label-wide text-muted">
              Fuente {index + 1}
            </span>
            <RemoveEntry
              label={`Quitar la fuente ${index + 1}`}
              onClick={() =>
                onChange(
                  value.length === 1
                    ? undefined
                    : value.filter((_, i) => i !== index),
                )
              }
            />
          </div>
          <input
            type="text"
            value={source.label}
            onChange={(e) => update(index, { label: e.target.value })}
            placeholder="Organismo o publicación"
            aria-label={`Nombre de la fuente ${index + 1}`}
            className={cn(inputClass, "mb-2")}
          />
          <input
            type="url"
            value={source.href}
            onChange={(e) => update(index, { href: e.target.value })}
            placeholder="https://…"
            aria-label={`Enlace de la fuente ${index + 1}`}
            className={cn(inputClass, "mb-2")}
          />
          <input
            type="text"
            value={source.note ?? ""}
            onChange={(e) => update(index, { note: e.target.value })}
            placeholder="Nota opcional"
            aria-label={`Nota de la fuente ${index + 1}`}
            className={inputClass}
          />
        </div>
      ))}
      <AddEntry onClick={() => onChange([...value, { label: "", href: "" }])}>
        Añadir fuente
      </AddEntry>
    </div>
  );
}

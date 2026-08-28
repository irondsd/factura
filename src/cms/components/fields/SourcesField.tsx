"use client";

import type { FieldDescriptor } from "@/cms/forms/fields";
import { cn } from "@/lib/cn";
import { CollapsibleField } from "./CollapsibleField";
import { AddEntry, inputClass, RemoveEntry } from "./controls";
import { asSources, type Source } from "./values";

// «Fuentes»: the primary documents a page rests on, and the data behind the
// `<Fuentes />` tag in the body. Three inputs per source, so the same reasoning
// as the FAQ — folded once it holds anything, with the count in the heading.

export function SourcesField({
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
  const sources = asSources(value);
  const collapseFrom = field.collapseFrom ?? Number.POSITIVE_INFINITY;

  return (
    <CollapsibleField
      label={field.label}
      required={required ?? field.required === true}
      help={field.help}
      invalid={invalid}
      summary={
        sources.length === 0
          ? undefined
          : `${sources.length} ${sources.length === 1 ? "fuente" : "fuentes"}`
      }
      collapsed={sources.length >= collapseFrom}
    >
      <SourcesInput value={sources} onChange={onChange} />
    </CollapsibleField>
  );
}

function SourcesInput({
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

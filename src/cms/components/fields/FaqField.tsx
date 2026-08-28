"use client";

import type { FieldDescriptor } from "@/cms/forms/fields";
import { cn } from "@/lib/cn";
import { CollapsibleField } from "./CollapsibleField";
import { AddEntry, inputClass, RemoveEntry } from "./controls";
import { asFaq, type FaqEntry } from "./values";

// «Preguntas frecuentes»: the four to six real search questions the page
// answers, and the data behind the `<Faq />` tag in the body.
//
// Six questions is twelve inputs and the better part of a screen, written once
// and then in the way of everything under it. It starts folded the moment it
// holds anything, and says how many.

export function FaqField({
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
  const entries = asFaq(value);
  const collapseFrom = field.collapseFrom ?? Number.POSITIVE_INFINITY;

  return (
    <CollapsibleField
      label={field.label}
      required={required ?? field.required === true}
      help={field.help}
      invalid={invalid}
      summary={
        entries.length === 0
          ? undefined
          : `${entries.length} ${entries.length === 1 ? "pregunta" : "preguntas"}`
      }
      collapsed={entries.length >= collapseFrom}
    >
      <FaqInput value={entries} onChange={onChange} />
    </CollapsibleField>
  );
}

function FaqInput({
  value,
  onChange,
}: {
  value: FaqEntry[];
  onChange: (next: FaqEntry[] | undefined) => void;
}) {
  const update = (index: number, patch: Partial<FaqEntry>) =>
    onChange(
      value.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    );

  return (
    <div>
      {value.map((item, index) => (
        // Index keys: the rows have no stable id and reordering is not offered.
        <div key={index} className="border border-line p-3 mb-2">
          <div className="flex items-center justify-between mb-2">
            <span className="font-mono text-[11px] uppercase tracking-label-wide text-muted">
              Pregunta {index + 1}
            </span>
            <RemoveEntry
              label={`Quitar la pregunta ${index + 1}`}
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
            value={item.q}
            onChange={(e) => update(index, { q: e.target.value })}
            placeholder="¿Pregunta?"
            aria-label={`Pregunta ${index + 1}`}
            className={cn(inputClass, "mb-2")}
          />
          <textarea
            rows={3}
            value={item.a}
            onChange={(e) => update(index, { a: e.target.value })}
            placeholder="Respuesta en texto plano."
            aria-label={`Respuesta ${index + 1}`}
            className={inputClass}
          />
        </div>
      ))}
      <AddEntry onClick={() => onChange([...value, { q: "", a: "" }])}>
        Añadir pregunta
      </AddEntry>
    </div>
  );
}

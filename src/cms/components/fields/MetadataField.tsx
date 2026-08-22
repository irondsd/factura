"use client";

import { useId, useState } from "react";
import type { FieldDescriptor } from "@/cms/forms/fields";
import { MediaPicker } from "@/cms/media/components/MediaPicker";
import { cn } from "@/lib/cn";

// One metadata field, rendered from its descriptor. Every section's form is
// built out of these, so section 12 adds field *entries* rather than a second
// form (cms.md).
//
// Nothing here shows JSON. A list of keywords is a list of keywords; the FAQ is
// pairs of boxes. Assembling the JSONB object is `toPatch`'s job, not the
// editor's.

/** A page that may be chosen as a parent. `slug` is carried alongside the
 * label because the create form has to build the child's full path from it. */
export type ParentOption = { value: string; label: string; slug: string };

export function MetadataField({
  field,
  value,
  onChange,
  parentOptions,
  invalid,
  required,
}: {
  field: FieldDescriptor;
  value: unknown;
  onChange: (next: unknown) => void;
  parentOptions?: readonly ParentOption[];
  invalid?: boolean;
  /** Whether this field is required *on this page* — `fieldState` resolves it,
   * because a conditional field is only required while its condition holds.
   * Falls back to the descriptor for a caller that has no document to ask. */
  required?: boolean;
}) {
  const id = useId();
  const isRequired = required ?? field.required === true;
  const describedBy = field.help ? `${id}-help` : undefined;

  // A read-only field renders as text, and there is no form control for a
  // `<label for>` to point at — so the label becomes a plain heading the value
  // names with `aria-labelledby` instead.
  const Label = field.readOnly ? "span" : "label";
  const labelClass =
    "block font-mono text-micro uppercase tracking-label-wide text-muted mb-1.5";

  return (
    <div className="mb-6">
      <Label
        {...(field.readOnly ? { id: `${id}-label` } : { htmlFor: id })}
        className={labelClass}
      >
        {field.label}
        {isRequired && (
          <span className="text-accent ml-1" aria-hidden="true">
            *
          </span>
        )}
        {isRequired && <span className="sr-only"> (obligatorio)</span>}
      </Label>

      <Control
        id={id}
        field={field}
        value={value}
        onChange={onChange}
        parentOptions={parentOptions}
        describedBy={describedBy}
        invalid={invalid}
      />

      {field.help && (
        <p
          id={describedBy}
          className="font-mono text-[12px] leading-[1.6] text-muted mt-1.5 mb-0"
        >
          {field.help}
        </p>
      )}
    </div>
  );
}

const inputClass =
  "w-full border border-line bg-paper px-3 py-2 font-mono text-[13.5px] text-ink placeholder:text-muted focus:border-accent focus:outline-none";

function Control({
  id,
  field,
  value,
  onChange,
  parentOptions,
  describedBy,
  invalid,
}: {
  id: string;
  field: FieldDescriptor;
  value: unknown;
  onChange: (next: unknown) => void;
  parentOptions?: readonly ParentOption[];
  describedBy?: string;
  invalid?: boolean;
}) {
  const shared = {
    id,
    "aria-describedby": describedBy,
    "aria-invalid": invalid || undefined,
    className: cn(inputClass, invalid && "border-[var(--vendor-ochre)]"),
  };

  // Displayed, not editable. Rendered as text on a paper-inset rather than as a
  // disabled input: a greyed-out box invites a click and then does nothing,
  // while this reads as a fact about the page, which is what it is.
  if (field.readOnly) {
    return (
      <p
        aria-labelledby={`${id}-label`}
        aria-describedby={describedBy}
        className="m-0 border border-line bg-paper px-3 py-2 font-mono text-[13.5px] text-muted"
      >
        {(value as string) || "—"}
      </p>
    );
  }

  switch (field.kind) {
    case "textarea":
      return (
        <>
          <textarea
            {...shared}
            rows={3}
            value={(value as string) ?? ""}
            placeholder={field.placeholder}
            onChange={(e) => onChange(e.target.value)}
          />
          <Counter value={value} softMax={field.softMax} />
        </>
      );

    case "number":
      return (
        <input
          {...shared}
          type="number"
          value={typeof value === "number" ? value : 0}
          onChange={(e) => onChange(Number(e.target.value))}
        />
      );

    case "parent":
      return (
        <select
          {...shared}
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value || null)}
        >
          <option value="">Ninguna (primer nivel)</option>
          {parentOptions?.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      );

    case "tags":
      return (
        <TagsInput
          value={asStrings(value)}
          onChange={onChange}
          id={id}
          describedBy={describedBy}
        />
      );

    case "multiselect":
      return (
        <MultiSelect
          value={asStrings(value)}
          options={field.options ?? []}
          onChange={onChange}
        />
      );

    case "faq":
      return <FaqInput value={asFaq(value)} onChange={onChange} />;

    case "media":
      return (
        <MediaPicker
          value={(value as string) || null}
          onChange={(id) => onChange(id ?? undefined)}
          describedBy={describedBy}
        />
      );
    case "ogImage":
      return (
        <OgImageInput value={asOgImage(value)} onChange={onChange} id={id} />
      );

    case "sources":
      return <SourcesInput value={asSources(value)} onChange={onChange} />;

    case "dataset":
      return (
        <DatasetInput value={asDataset(value)} onChange={onChange} id={id} />
      );

    default:
      return (
        <>
          <input
            {...shared}
            type="text"
            value={(value as string) ?? ""}
            placeholder={field.placeholder}
            onChange={(e) => onChange(e.target.value)}
          />
          <Counter value={value} softMax={field.softMax} />
        </>
      );
  }
}

/** A live character count against the length the guidance is written around.
 * Advisory, not enforcement — the validator owns the rules, and an editor who
 * needs 62 characters should be able to save and see the warning. */
function Counter({ value, softMax }: { value: unknown; softMax?: number }) {
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

function TagsInput({
  value,
  onChange,
  id,
  describedBy,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  id: string;
  describedBy?: string;
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
              {/* The first keyword is the query the page is written to win. */}
              {index === 0 && (
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
                ×
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
          placeholder="Escribe y pulsa Enter"
          className={inputClass}
        />
        <button
          type="button"
          onClick={add}
          className="border border-line px-3 font-mono text-micro uppercase tracking-label-wide text-muted hover:border-accent hover:text-accent"
        >
          Añadir
        </button>
      </div>
    </div>
  );
}

function MultiSelect({
  value,
  options,
  onChange,
}: {
  value: string[];
  options: readonly { value: string; label: string }[];
  onChange: (next: string[]) => void;
}) {
  const toggle = (option: string) =>
    onChange(
      value.includes(option)
        ? value.filter((v) => v !== option)
        : [...value, option],
    );

  return (
    <ul className="flex flex-wrap gap-2 list-none p-0 m-0">
      {options.map((option) => {
        const index = value.indexOf(option.value);
        const selected = index >= 0;
        return (
          <li key={option.value}>
            <button
              type="button"
              onClick={() => toggle(option.value)}
              aria-pressed={selected}
              className={cn(
                "border px-3 py-1.5 font-mono text-[12px] transition-colors",
                selected
                  ? "border-accent text-accent"
                  : "border-line text-muted hover:border-accent",
              )}
            >
              {/* Order is meaningful — the first category decides the index
                  grouping and the breadcrumb — so selected chips show it. */}
              {selected && (
                <span className="mr-1.5 opacity-70">{index + 1}</span>
              )}
              {option.label}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function FaqInput({
  value,
  onChange,
}: {
  value: { q: string; a: string }[];
  onChange: (next: { q: string; a: string }[] | undefined) => void;
}) {
  const update = (index: number, patch: Partial<{ q: string; a: string }>) =>
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
            <button
              type="button"
              onClick={() =>
                onChange(
                  value.length === 1
                    ? undefined
                    : value.filter((_, i) => i !== index),
                )
              }
              className="font-mono text-[11px] text-muted hover:text-accent"
            >
              Quitar
            </button>
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
      <button
        type="button"
        onClick={() => onChange([...value, { q: "", a: "" }])}
        className="border border-line px-3 py-1.5 font-mono text-micro uppercase tracking-label-wide text-muted hover:border-accent hover:text-accent"
      >
        Añadir pregunta
      </button>
    </div>
  );
}

function OgImageInput({
  value,
  onChange,
  id,
}: {
  value: { eyebrow?: string; stat?: string };
  onChange: (next: { eyebrow?: string; stat?: string } | undefined) => void;
  id: string;
}) {
  const set = (patch: { eyebrow?: string; stat?: string }) => {
    const next = { ...value, ...patch };
    const cleaned = Object.fromEntries(
      Object.entries(next).filter(([, v]) => (v ?? "").trim() !== ""),
    );
    onChange(Object.keys(cleaned).length === 0 ? undefined : cleaned);
  };

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <input
        id={id}
        type="text"
        value={value.eyebrow ?? ""}
        onChange={(e) => set({ eyebrow: e.target.value })}
        placeholder="Línea superior"
        aria-label="Línea superior de la tarjeta"
        className={inputClass}
      />
      <input
        type="text"
        value={value.stat ?? ""}
        onChange={(e) => set({ stat: e.target.value })}
        placeholder="Cifra destacada"
        aria-label="Cifra destacada de la tarjeta"
        className={inputClass}
      />
    </div>
  );
}

const asStrings = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string")
    : [];

const asFaq = (value: unknown): { q: string; a: string }[] =>
  Array.isArray(value) ? (value as { q: string; a: string }[]) : [];

const asOgImage = (value: unknown): { eyebrow?: string; stat?: string } =>
  value && typeof value === "object"
    ? (value as { eyebrow?: string; stat?: string })
    : {};

type Source = { label: string; href: string; note?: string };
type Dataset = {
  name?: string;
  description?: string;
  temporalCoverage?: string;
  spatialCoverage?: string;
  variableMeasured?: string[];
  license?: string;
};

const asSources = (value: unknown): Source[] =>
  Array.isArray(value)
    ? value.filter(
        (item): item is Source => item !== null && typeof item === "object",
      )
    : [];

const asDataset = (value: unknown): Dataset =>
  value !== null && typeof value === "object" ? (value as Dataset) : {};

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
            <button
              type="button"
              onClick={() =>
                onChange(
                  value.length === 1
                    ? undefined
                    : value.filter((_, i) => i !== index),
                )
              }
              className="font-mono text-[11px] text-muted hover:text-accent"
            >
              Quitar
            </button>
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
      <button
        type="button"
        onClick={() => onChange([...value, { label: "", href: "" }])}
        className="border border-line px-3 py-1.5 font-mono text-micro uppercase tracking-label-wide text-muted hover:border-accent hover:text-accent"
      >
        Añadir fuente
      </button>
    </div>
  );
}

function DatasetInput({
  value,
  onChange,
  id,
}: {
  value: Dataset;
  onChange: (next: Dataset | undefined) => void;
  id: string;
}) {
  const set = (patch: Partial<Dataset>) => {
    const next = { ...value, ...patch };
    onChange(
      Object.values(next).some((item) =>
        Array.isArray(item) ? item.length > 0 : (item ?? "").trim() !== "",
      )
        ? next
        : undefined,
    );
  };
  return (
    <div className="grid gap-2">
      <input
        id={id}
        type="text"
        value={value.name ?? ""}
        onChange={(e) => set({ name: e.target.value })}
        placeholder="Nombre oficial de la serie"
        aria-label="Nombre del conjunto de datos"
        className={inputClass}
      />
      <textarea
        rows={2}
        value={value.description ?? ""}
        onChange={(e) => set({ description: e.target.value })}
        placeholder="Qué representa una observación"
        aria-label="Descripción del conjunto de datos"
        className={inputClass}
      />
      <div className="grid gap-2 sm:grid-cols-2">
        <input
          type="text"
          value={value.temporalCoverage ?? ""}
          onChange={(e) => set({ temporalCoverage: e.target.value })}
          placeholder="Cobertura temporal, ej. 2020-01/2026-06"
          aria-label="Cobertura temporal"
          className={inputClass}
        />
        <input
          type="text"
          value={value.spatialCoverage ?? ""}
          onChange={(e) => set({ spatialCoverage: e.target.value })}
          placeholder="Cobertura geográfica"
          aria-label="Cobertura geográfica"
          className={inputClass}
        />
      </div>
      <TagsInput
        value={value.variableMeasured ?? []}
        onChange={(variableMeasured) => set({ variableMeasured })}
        id={`${id}-variables`}
      />
      {/* Left blank on nearly every page: the site-wide licence
          (`dataLicense`) is what both the markup and the sources block use.
          Fill it only when this page's numbers travel under other terms. */}
      <input
        type="url"
        value={value.license ?? ""}
        onChange={(e) => set({ license: e.target.value.trim() || undefined })}
        placeholder="Licencia propia, ej. https://creativecommons.org/publicdomain/zero/1.0/"
        aria-label="Licencia del conjunto de datos"
        className={inputClass}
      />
    </div>
  );
}

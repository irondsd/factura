"use client";

import { useId } from "react";
import type { FieldDescriptor } from "@/cms/forms/fields";
import { MediaPicker } from "@/cms/media/components/MediaPicker";
import { cn } from "@/lib/cn";
import { CategoriesField } from "./CategoriesField";
import { Counter, inputClass, TagsInput } from "./controls";
import { FaqField } from "./FaqField";
import { KeywordsField } from "./KeywordsField";
import { LocationsField } from "./LocationsField";
import { SourcesField } from "./SourcesField";
import { asDataset, asOgImage, type Dataset, type OgImage } from "./values";

// One metadata field, rendered from its descriptor. Every section's form is
// built out of these, so section 12 adds field *entries* rather than a second
// form (cms.md).
//
// Nothing here shows JSON. A list of keywords is a list of keywords; the FAQ is
// pairs of boxes. Assembling the JSONB object is `toPatch`'s job, not the
// editor's.
//
// Three kinds bring their own heading, because their heading is a fold and has
// to say what is folded away — see `CollapsibleField`. Everything else is a
// label, a control and a line of help, laid out here.

/** A page that may be chosen as a parent. `slug` is carried alongside the
 * label because the create form has to build the child's full path from it. */
export type ParentOption = { value: string; label: string; slug: string };

/** The kinds that render their own label, because it doubles as the fold. */
const SELF_HEADING: ReadonlySet<FieldDescriptor["kind"]> = new Set([
  "tags",
  "faq",
  "sources",
]);

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

  if (SELF_HEADING.has(field.kind)) {
    const props = { field, value, onChange, required: isRequired, invalid };
    switch (field.kind) {
      case "tags":
        return <KeywordsField {...props} />;
      case "faq":
        return <FaqField {...props} />;
      default:
        return <SourcesField {...props} />;
    }
  }

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

    case "multiselect":
      return (
        <CategoriesField
          field={field}
          value={value}
          onChange={onChange}
          describedBy={describedBy}
          invalid={invalid}
        />
      );

    case "locations":
      return (
        <LocationsField
          id={id}
          field={field}
          value={value}
          onChange={onChange}
          describedBy={describedBy}
          invalid={invalid}
        />
      );

    // One row from a database-owned list, or none. `undefined` rather than an
    // empty string when nothing is chosen, so the key is absent from the JSONB
    // instead of holding "" — which the metadata schema would refuse.
    case "select":
      return (
        <select
          {...shared}
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value || undefined)}
        >
          <option value="">{field.emptyLabel ?? "Ninguno"}</option>
          {field.options?.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      );

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

function OgImageInput({
  value,
  onChange,
  id,
}: {
  value: OgImage;
  onChange: (next: OgImage | undefined) => void;
  id: string;
}) {
  const set = (patch: OgImage) => {
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
        placeholder="Variable medida, y pulsa Enter"
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

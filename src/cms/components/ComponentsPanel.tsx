"use client";

import { useId, useState } from "react";
import type { ComponentEntry, ComponentState } from "@/cms/forms/components";
import type { FieldDescriptor } from "@/cms/forms/fields";
import { cn } from "@/lib/cn";
import { CmsIcon } from "../icons";
import { FaqInput } from "./fields/FaqField";
import { MethodologyInput } from "./fields/MethodologyField";
import { SourcesInput } from "./fields/SourcesField";
import { asFaq, asMethodology, asSources } from "./fields/values";

// The «Componentes» tab: one card per tag the body places that needs data to
// draw — the FAQ's questions, the sources' links, the methodology's lines.
//
// They used to sit in the sidebar among the title and the keywords, which is a
// different kind of thing: those describe the page, these are the page's
// content, edited somewhere other than the Markdown only because they are
// structured. A card is listed while the body places its tag and folded while it
// is finished, so what is open is what is left to do.
//
// The panel mounts with the tab, so every visit folds afresh from the current
// state: a card finished during the last visit is closed on the next.

const STATE_LABEL: Record<ComponentState, string> = {
  ok: "Completo",
  warning: "Revisar",
  error: "Falta completar",
};

export function ComponentsPanel({
  entries,
  fields,
  values,
  onChange,
}: {
  entries: readonly ComponentEntry[];
  /** Every field of the section, for the empty state's list of tags. */
  fields: readonly FieldDescriptor[];
  values: Record<string, unknown>;
  onChange: (path: string, next: unknown) => void;
}) {
  if (entries.length === 0) {
    const tags = fields.flatMap((field) =>
      field.placedBy ? [`<${field.placedBy} />`] : [],
    );
    return (
      <p className="font-mono text-[13px] leading-[1.7] text-muted border border-line border-dashed px-5 py-8 text-center">
        Esta página no usa componentes que necesiten datos.
        {tags.length > 0 && (
          <>
            <br />
            Escribe {joinTags(tags)} en el cuerpo y aparecen aquí para
            completarlos.
          </>
        )}
      </p>
    );
  }

  const stranded = entries.filter((entry) => !entry.placed);

  return (
    <div>
      {entries
        .filter((entry) => entry.placed)
        .map((entry) => (
          <ComponentCard
            key={entry.field.path}
            entry={entry}
            value={values[entry.field.path]}
            onChange={(next) => onChange(entry.field.path, next)}
          />
        ))}

      {stranded.length > 0 && (
        <>
          <h3 className="font-mono text-micro uppercase tracking-label-wide text-muted border-b border-line pb-2 mt-8 mb-4">
            Sin etiqueta en el cuerpo
          </h3>
          {stranded.map((entry) => (
            <ComponentCard
              key={entry.field.path}
              entry={entry}
              value={values[entry.field.path]}
              onChange={(next) => onChange(entry.field.path, next)}
            />
          ))}
        </>
      )}
    </div>
  );
}

function ComponentCard({
  entry,
  value,
  onChange,
}: {
  entry: ComponentEntry;
  value: unknown;
  onChange: (next: unknown) => void;
}) {
  const id = useId();
  const { field, component, placed, state, problems, summary } = entry;
  const [open, setOpen] = useState(state !== "ok");

  // Unfold on the transition into trouble, the way `CollapsibleField` does: a
  // check that comes back with something to say about a closed card opens it,
  // and after that the fold is the editor's again.
  const [seen, setSeen] = useState(state);
  if (state !== seen) {
    setSeen(state);
    if (state !== "ok") setOpen(true);
  }

  return (
    <section
      className={cn(
        "border mb-4 bg-card",
        placed ? "border-line" : "border-dashed border-line",
      )}
    >
      <button
        type="button"
        id={`${id}-label`}
        aria-expanded={open}
        aria-controls={`${id}-body`}
        onClick={() => setOpen((current) => !current)}
        className="flex w-full cursor-pointer items-center gap-2 border-0 bg-transparent px-4 py-3 text-left font-mono text-micro uppercase tracking-label-wide text-ink transition-colors hover:text-accent"
      >
        <CmsIcon
          name={open ? "chevronDown" : "chevronRight"}
          size="xs"
          className="shrink-0 text-muted"
        />
        <span>{field.label}</span>
        <code className="normal-case tracking-normal text-[12px] text-muted">
          {`<${component} />`}
        </code>
        <span className="ml-auto flex items-center gap-3 normal-case tracking-normal text-[12px]">
          {summary && <span className="text-muted">{summary}</span>}
          <StateMark state={state} />
        </span>
      </button>

      <div
        id={`${id}-body`}
        role="group"
        aria-labelledby={`${id}-label`}
        hidden={!open}
        className="border-t border-line px-4 pt-4 pb-4"
      >
        {problems.length > 0 && (
          <ul className="list-none p-0 mt-0 mb-4">
            {problems.map((problem) => (
              <li
                key={problem}
                className={cn(
                  "border-l-2 pl-3 py-1 mb-1 font-mono text-[12px] leading-[1.6] text-ink",
                  state === "error"
                    ? "border-accent"
                    : "border-[var(--vendor-ochre)]",
                )}
              >
                {problem}
              </li>
            ))}
          </ul>
        )}

        <ComponentInput field={field} value={value} onChange={onChange} />

        {field.help && (
          <p className="font-mono text-[12px] leading-[1.6] text-muted mt-3 mb-0">
            {field.help}
          </p>
        )}

        {!placed && (
          <button
            type="button"
            onClick={() => onChange(undefined)}
            className="mt-4 inline-flex items-center gap-2 border border-dashed border-line px-3 py-2 font-mono text-micro uppercase tracking-label-wide text-muted transition-colors hover:border-accent hover:text-accent"
          >
            <CmsIcon name="delete" size="sm" />
            Vaciar este componente
          </button>
        )}
      </div>
    </section>
  );
}

function StateMark({ state }: { state: ComponentState }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 font-mono text-[11px] uppercase tracking-label-wide",
        state === "ok" && "text-ok",
        state === "warning" && "text-[var(--vendor-ochre)]",
        state === "error" && "text-accent",
      )}
    >
      <CmsIcon name={state === "ok" ? "check" : "alert"} size="xs" />
      {STATE_LABEL[state]}
    </span>
  );
}

function ComponentInput({
  field,
  value,
  onChange,
}: {
  field: FieldDescriptor;
  value: unknown;
  onChange: (next: unknown) => void;
}) {
  switch (field.kind) {
    case "faq":
      return <FaqInput value={asFaq(value)} onChange={onChange} />;
    case "sources":
      return <SourcesInput value={asSources(value)} onChange={onChange} />;
    case "methodology":
      return (
        <MethodologyInput value={asMethodology(value)} onChange={onChange} />
      );
    default:
      return null;
  }
}

/** «<Faq />, <Fuentes /> o <Metodologia />». */
function joinTags(tags: readonly string[]): string {
  if (tags.length <= 1) return tags.join("");
  return `${tags.slice(0, -1).join(", ")} o ${tags[tags.length - 1]}`;
}

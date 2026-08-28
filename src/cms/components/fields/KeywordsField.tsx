"use client";

import { useId } from "react";
import type { FieldDescriptor } from "@/cms/forms/fields";
import { CollapsibleField } from "./CollapsibleField";
import { TagsInput } from "./controls";
import { asStrings } from "./values";

// «Palabras clave»: the three-to-six queries the page is written to win, the
// first of which is the one it is really written for.
//
// Collapsed from the fourth onwards. Below that the chips are shorter than the
// sentence explaining them, so folding would save nothing and cost a click.

export function KeywordsField({
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
  const id = useId();
  const keywords = asStrings(value);
  const collapseFrom = field.collapseFrom ?? Number.POSITIVE_INFINITY;

  return (
    <CollapsibleField
      label={field.label}
      required={required ?? field.required === true}
      help={field.help}
      invalid={invalid}
      summary={summarize(keywords.length, field.softMaxItems)}
      collapsed={keywords.length >= collapseFrom}
    >
      <TagsInput
        id={id}
        value={keywords}
        primaryFirst
        onChange={(next) => onChange(next.length === 0 ? undefined : next)}
      />
    </CollapsibleField>
  );
}

/** «5 / 6» when there is a recommended count to measure against, a bare number
 * otherwise. The denominator is the guidance, not a limit: a seventh keyword is
 * something the validator complains about, not something the form refuses. */
function summarize(count: number, softMaxItems?: number): string | undefined {
  if (count === 0) return undefined;
  return softMaxItems ? `${count} / ${softMaxItems}` : String(count);
}

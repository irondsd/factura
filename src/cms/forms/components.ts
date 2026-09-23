import {
  METHODOLOGY_FIELDS,
  methodologyEntries,
  type Diagnostic,
} from "@/content-system/types";
import { asFaq, asSources } from "@/cms/components/fields/values";
import { bodyPlaces, type FieldDescriptor, isBlank } from "./fields";

// «Componentes»: the data behind the tags in the body.
//
// A `placedBy` field is not copy an editor writes into a form, it is what a
// `<Faq />` or a `<Fuentes />` draws — so it lives in its own tab, next to the
// Markdown that places it, and only while the Markdown places it. This module
// decides which of them are on the page and whether each one is finished,
// without a round trip: the tab's counter follows the typing.
//
// The server's answer still counts. The checks here are the ones worth making
// live — empty, half-filled, markup in an answer — and the publish gate asks
// more than that, so a clean editor also folds in whatever the last check said
// about the field. An edited one does not: those diagnostics are about a
// document that is no longer on screen.

export type ComponentState = "ok" | "warning" | "error";

export type ComponentEntry = {
  field: FieldDescriptor;
  /** The JSX name, without brackets — `Faq`. */
  component: string;
  /** Whether the body places the tag. An unplaced entry is only listed when it
   * still holds data, so the editor can clear what no page shows. */
  placed: boolean;
  state: ComponentState;
  /** What is left to do, in the editor's words. */
  problems: readonly string[];
  /** One line for the closed card — «6 preguntas», «3 / 5 campos». */
  summary?: string;
};

/** Every component field this page has something to say about, placed ones
 * first in declaration order, then the stranded ones. */
export function componentEntries(
  fields: readonly FieldDescriptor[],
  context: {
    body: string;
    values: Record<string, unknown>;
    /** From the last publish-level check, or empty when it is stale. */
    diagnostics: readonly Diagnostic[];
  },
): ComponentEntry[] {
  const entries = fields.flatMap((field): ComponentEntry[] => {
    if (!field.placedBy) return [];
    const value = context.values[field.path];
    const placed = bodyPlaces(context.body, field.placedBy);
    if (!placed && isBlank(value)) return [];
    return [
      {
        field,
        component: field.placedBy,
        placed,
        ...assess(field, value, placed, context.diagnostics),
      },
    ];
  });
  return [
    ...entries.filter((entry) => entry.placed),
    ...entries.filter((entry) => !entry.placed),
  ];
}

/** The tab's counter: how many cards the tab holds, and whether every one of
 * them is finished. A stranded one counts, and is never finished — it is data
 * no page shows, which is something to clean up. */
export function componentTally(entries: readonly ComponentEntry[]): {
  count: number;
  ok: boolean;
} {
  return {
    count: entries.length,
    ok: entries.every((entry) => entry.state === "ok"),
  };
}

/** Whether a diagnostic is about this component's data. Shape errors name the
 * entry (`faq.2.q`), so the prefix counts too. */
export function isComponentDiagnostic(
  diagnostic: Diagnostic,
  fields: readonly FieldDescriptor[],
): boolean {
  const target = diagnostic.field;
  if (!target) return false;
  return fields.some((field) => {
    if (!field.placedBy) return false;
    const key = field.path.replace(/^metadata\./, "");
    return target === key || target.startsWith(`${key}.`);
  });
}

function assess(
  field: FieldDescriptor,
  value: unknown,
  placed: boolean,
  diagnostics: readonly Diagnostic[],
): Pick<ComponentEntry, "state" | "problems" | "summary"> {
  const errors: string[] = [];
  const warnings: string[] = [];
  let summary: string | undefined;

  if (!placed) {
    errors.push(
      `El cuerpo ya no escribe <${field.placedBy} />, así que estos datos no se muestran en ninguna parte. Vuelve a poner la etiqueta o vacía el componente.`,
    );
  }

  switch (field.kind) {
    case "faq": {
      const faq = asFaq(value);
      if (faq.length > 0) {
        summary = `${faq.length} ${faq.length === 1 ? "pregunta" : "preguntas"}`;
      }
      if (placed && faq.length === 0) {
        errors.push("Añade al menos una pregunta: el bloque está vacío.");
      }
      faq.forEach((item, index) => {
        if (isBlank(item?.q) || isBlank(item?.a)) {
          errors.push(
            `La pregunta ${index + 1} no tiene pregunta o respuesta.`,
          );
        } else if (/\[[^\]]*\]\([^)]*\)|<[a-zA-Z]/.test(item.a)) {
          errors.push(
            `La respuesta ${index + 1} tiene enlaces o etiquetas: las respuestas son texto plano.`,
          );
        }
      });
      if (faq.length > 0 && faq.length < 3) {
        warnings.push("Conviene tener entre 4 y 6 preguntas.");
      }
      break;
    }
    case "sources": {
      const sources = asSources(value);
      if (sources.length > 0) {
        summary = `${sources.length} ${sources.length === 1 ? "fuente" : "fuentes"}`;
      }
      if (placed && sources.length === 0) {
        errors.push("Añade al menos una fuente: el bloque está vacío.");
      }
      sources.forEach((source, index) => {
        if (isBlank(source.label) || isBlank(source.href)) {
          errors.push(
            `A la fuente ${index + 1} le falta el nombre o el enlace.`,
          );
        }
      });
      break;
    }
    case "methodology": {
      const filled = methodologyEntries(value).length;
      if (filled > 0) {
        summary = `${filled} / ${METHODOLOGY_FIELDS.length} campos`;
      }
      if (placed && filled === 0) {
        // A warning to the validator — an empty block draws nothing and
        // promises nothing — but a tag somebody typed and never filled is
        // still unfinished work, which is what this tab counts.
        warnings.push(
          "Completa al menos un campo: el bloque no se dibuja vacío.",
        );
      }
      break;
    }
  }

  // The server asks more than the checks above. Its messages are
  // developer-facing, so they are shown only when there is nothing better to
  // say — which is exactly when they are the only explanation for the colour.
  const key = field.path.replace(/^metadata\./, "");
  const own = diagnostics.filter(
    (d) => d.field === key || d.field?.startsWith(`${key}.`),
  );
  if (errors.length === 0 && warnings.length === 0) {
    for (const diagnostic of own) {
      (diagnostic.severity === "error" ? errors : warnings).push(
        diagnostic.message,
      );
    }
  } else if (errors.length === 0 && own.some((d) => d.severity === "error")) {
    errors.push(
      ...own.filter((d) => d.severity === "error").map((d) => d.message),
    );
  }

  return {
    state: errors.length > 0 ? "error" : warnings.length > 0 ? "warning" : "ok",
    problems: [...errors, ...warnings],
    summary,
  };
}

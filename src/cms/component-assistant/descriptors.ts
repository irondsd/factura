import { z } from "zod";
import {
  componentDefinition,
  componentsForSection,
  type ComponentAuthoringGroup,
  type ComponentAuthoringMetadata,
  type ContentComponentDefinition,
} from "@/content-system/components/definitions";
import type { ContentSection } from "@/content-system/types";
import {
  COMPONENT_AUTHORING_GROUPS,
  type ComponentCompletionDescriptor,
  type ComponentInsertTemplate,
  type ComponentPropertyDescriptor,
} from "./types";
import { materializeSnippet, snippetField } from "./snippets";

type JsonSchema = {
  type?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  enum?: unknown[];
  pattern?: string;
  description?: string;
};

const CONTEXT_BOUND_NAMES = new Set([
  "Faq",
  "RelatedGuides",
  "Fuentes",
  "Subpaginas",
]);

const STRUCTURE_NAMES = new Set([
  "ClosingCta",
  "Faq",
  "Fuentes",
  "RelatedGuides",
  "Subpaginas",
  "PaginaRelacionada",
  "TrustBlock",
]);

const CTA_NAMES = new Set([
  "ProbarCta",
  "CtaButton",
  "CtaRow",
  "DemoCta",
  "SignupCta",
]);

const GROUP_BY_ID = new Map(
  COMPONENT_AUTHORING_GROUPS.map((group) => [group.id, group]),
);

const GROUP_HINTS: Record<ComponentAuthoringGroup, string> = {
  "article-structure": "Bloques que ordenan y completan el artículo.",
  "calls-to-action": "Componentes para invitar a probar Factura.",
  "charts-summaries": "Gráficos y tarjetas que resumen una serie.",
  maps: "Visualizaciones geográficas.",
  "tables-comparisons": "Tablas, comparaciones y otras vistas de datos.",
};

/** Project one section of the React-free manifest into the serializable shape
 * that crosses the Next server/client boundary. The schema is inspected here,
 * on the server, through Zod's public JSON-Schema API; the browser never sees
 * a Zod instance or has to know how a schema is implemented. */
export function componentCompletionDescriptors(
  section: ContentSection,
): ComponentCompletionDescriptor[] {
  return componentsForSection(section)
    .map((name) => {
      const definition = componentDefinition(name);
      if (!definition) {
        throw new Error(`Missing component definition for ${name}`);
      }
      return descriptorForComponent(name, definition);
    })
    .sort(compareDescriptors);
}

export function descriptorForComponent(
  name: string,
  definition: ContentComponentDefinition,
): ComponentCompletionDescriptor {
  const authoring = definition.authoring;
  const group = authoring?.group ?? defaultGroup(name);
  const groupRank = GROUP_BY_ID.get(group)?.rank ?? 999;
  const rank = authoring?.rank ?? defaultRank(name, group);
  const props = projectProperties(name, definition, authoring);
  const template = buildTemplate(name, definition, props, authoring);

  const notes = [
    ...(authoring?.notes ?? []),
    ...(CONTEXT_BOUND_NAMES.has(name)
      ? ["Escribe el componente bare, sin propiedades."]
      : []),
    ...(props.length === 0 && !CONTEXT_BOUND_NAMES.has(name)
      ? ["Este componente está ligado a su dataset; no agregues propiedades."]
      : []),
  ];

  return {
    name,
    kind: definition.kind,
    label: authoring?.label ?? defaultLabel(name),
    group,
    rank: groupRank * 1000 + rank,
    description: definition.description,
    props,
    template,
    notes: [...new Set(notes)],
  };
}

function projectProperties(
  name: string,
  definition: ContentComponentDefinition,
  authoring?: ComponentAuthoringMetadata,
): ComponentPropertyDescriptor[] {
  // `z.toJSONSchema` is the public Zod 4 projection. Keeping this call in this
  // server-side module is what prevents client code from depending on `_def`.
  const schema = z.toJSONSchema(definition.props) as JsonSchema;
  const required = new Set(schema.required ?? []);

  return Object.entries(schema.properties ?? {}).map(([propertyName, raw]) => {
    const values = Array.isArray(raw.enum)
      ? raw.enum.filter((value): value is string => typeof value === "string")
      : undefined;
    const type: ComponentPropertyDescriptor["type"] =
      raw.type === "boolean" ? "boolean" : "string";
    const propertyDescription =
      authoring?.propertyDescriptions?.[propertyName] ?? raw.description;
    const placeholder =
      authoring?.propertyPlaceholders?.[propertyName] ??
      defaultPlaceholder(name, propertyName, raw, values);

    return {
      name: propertyName,
      required: required.has(propertyName),
      type,
      ...(values && values.length > 0 ? { values } : {}),
      ...(raw.pattern ? { pattern: raw.pattern } : {}),
      ...(propertyDescription ? { description: propertyDescription } : {}),
      ...(placeholder ? { placeholder } : {}),
    } satisfies ComponentPropertyDescriptor;
  });
}

function buildTemplate(
  name: string,
  definition: ContentComponentDefinition,
  props: readonly ComponentPropertyDescriptor[],
  authoring?: ComponentAuthoringMetadata,
): ComponentInsertTemplate {
  const snippet =
    authoring?.template ?? genericTemplate(name, definition, props, authoring);
  return { snippet, preview: materializeSnippet(snippet) };
}

function genericTemplate(
  name: string,
  definition: ContentComponentDefinition,
  props: readonly ComponentPropertyDescriptor[],
  authoring?: ComponentAuthoringMetadata,
): string {
  let fieldNumber = 1;
  const attributes = props
    .filter(
      (property) =>
        property.required ||
        Object.hasOwn(authoring?.defaultProps ?? {}, property.name),
    )
    .map((property) => {
      const defaultValue =
        authoring?.defaultProps?.[property.name] ??
        property.values?.[0] ??
        property.placeholder ??
        (property.type === "boolean" ? false : "Texto específico");

      if (property.type === "boolean") {
        if (defaultValue === true) return property.name;
        if (defaultValue === false) {
          // The grammar accepts the exact string spellings and coerces them to
          // booleans. A quoted field keeps the value editable with Tab.
          return `${property.name}="${snippetField(fieldNumber++, "false")}"`;
        }
      }

      return `${property.name}="${snippetField(
        fieldNumber++,
        String(defaultValue),
      )}"`;
    });
  const attributesText =
    attributes.length > 0 ? ` ${attributes.join(" ")}` : "";

  if (definition.kind === "leaf") {
    return `<${name}${attributesText} />${snippetField(0, "")}`;
  }

  const child =
    authoring?.childPlaceholder ?? "Escribe aquí el contenido de este bloque.";
  return `<${name}${attributesText}>\n\n${snippetField(0, child)}\n\n</${name}>`;
}

function defaultPlaceholder(
  name: string,
  propertyName: string,
  schema: JsonSchema,
  values: readonly string[] | undefined,
): string | undefined {
  if (values && values.length > 0) return values[0];
  if (schema.pattern?.includes("estadisticas|investigaciones")) {
    return "/estadisticas/ruta";
  }
  if (propertyName === "href") return "/demo";
  if (propertyName === "title") return "Título específico";
  if (propertyName === "vendor") return "Empresa";
  if (propertyName === "noun") return "factura";
  if (propertyName === "chart") return "luz-y-gas";
  if (name) return "Texto específico";
  return undefined;
}

function defaultGroup(name: string): ComponentAuthoringGroup {
  if (STRUCTURE_NAMES.has(name)) return "article-structure";
  if (CTA_NAMES.has(name)) return "calls-to-action";
  if (/Mapa$/.test(name)) return "maps";
  if (
    /(?:Chart|Ipc|Resumen|Historia|Cambio|Cobertura|Cuando|Dispersion|Ganadores|Contraste|Sensibilidad)$/.test(
      name,
    )
  ) {
    return "charts-summaries";
  }
  return "tables-comparisons";
}

function defaultRank(name: string, group: ComponentAuthoringGroup): number {
  if (group === "article-structure") return 200;
  if (group === "calls-to-action") return 300;
  return name.length;
}

function defaultLabel(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/Caba/g, "CABA")
    .replace(/Pba/g, "PBA")
    .replace(/Ipc/g, "IPC");
}

function compareDescriptors(
  a: ComponentCompletionDescriptor,
  b: ComponentCompletionDescriptor,
): number {
  return a.rank - b.rank || a.name.localeCompare(b.name);
}

/** A short description used by completion section headers and tests. */
export function authoringGroupHint(group: ComponentAuthoringGroup): string {
  return GROUP_HINTS[group];
}

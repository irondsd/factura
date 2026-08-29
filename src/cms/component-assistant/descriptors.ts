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
  const group = authoring.group;
  const groupRank = GROUP_BY_ID.get(group)?.rank ?? 999;
  const rank = authoring.rank ?? defaultRank(group);
  const props = projectProperties(definition, authoring);
  const template = buildTemplate(name, definition, props, authoring);

  // A leaf with no schema is one the route binds: the author writes the bare
  // tag and the page supplies the data. Containers with no schema are a
  // different thing — their children *are* the content — so they get no note.
  const notes = [
    ...(authoring.notes ?? []),
    ...(definition.kind === "leaf" && props.length === 0
      ? ["Escribe el componente bare, sin propiedades."]
      : []),
  ];

  return {
    name,
    kind: definition.kind,
    label: authoring.label,
    group,
    rank: groupRank * 1000 + rank,
    description: definition.description,
    props,
    template,
    notes: [...new Set(notes)],
  };
}

function projectProperties(
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
      defaultPlaceholder(propertyName, raw, values);

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
  // A CodeMirror field cannot span lines — the snippet parser works line by
  // line, so a multi-line default is left in the document verbatim. A child
  // placeholder that is itself several blocks (a CTA row, say) therefore
  // becomes one tab stop per line, which is the more useful shape anyway.
  const lines = child.split("\n");
  const lastFilled = lines.reduce(
    (last, line, index) => (line.trim() ? index : last),
    -1,
  );
  const body = lines
    .map((line, index) =>
      line.trim()
        ? snippetField(index === lastFilled ? 0 : fieldNumber++, line)
        : line,
    )
    .join("\n");
  return `<${name}${attributesText}>\n\n${body}\n\n</${name}>`;
}

function defaultPlaceholder(
  propertyName: string,
  schema: JsonSchema,
  values: readonly string[] | undefined,
): string {
  if (values && values.length > 0) return values[0];
  if (schema.pattern?.includes("estadisticas|investigaciones")) {
    return "/estadisticas/ruta";
  }
  if (propertyName === "href") return "/demo";
  if (propertyName === "title") return "Título específico";
  if (propertyName === "vendor") return "Empresa";
  if (propertyName === "noun") return "factura";
  return "Texto específico";
}

/** One rank for the whole generated catalogue, so `compareDescriptors` and
 * `sortText` fall through to the name. Dozens of `Delitos*`/`Escrituras*`
 * entries listed alphabetically keep each dataset's components together;
 * anything cleverer has to be predictable to the author, which means it
 * belongs in the manifest as an explicit rank. */
function defaultRank(group: ComponentAuthoringGroup): number {
  return group === "article-structure" || group === "calls-to-action"
    ? 200
    : 500;
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

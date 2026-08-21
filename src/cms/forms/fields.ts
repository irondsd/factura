import { CATEGORIES } from "@/content/guias/categories";
import type { ContentSection } from "@/content-system/types";

// The metadata form, described as data.
//
// §7.1: sections differ in data, never in branches. The editor renders whatever
// fields a section declares here, so adding statistics in section 12 is a new
// `FIELDS` entry rather than a second editor with a different form — and the
// field components below are written once for every section.
//
// Editors never see raw JSON (§3.7). A field says where it reads and writes —
// a column on the document, or a key inside `metadata` — and the form assembles
// the JSONB object from those.

export type FieldKind =
  /** One line of text. */
  | "text"
  /** Several lines. */
  | "textarea"
  /** A URL path segment, validated as a slug. */
  | "slug"
  /** A free list of short strings, added one at a time. */
  | "tags"
  /** A fixed set, several choices allowed, order meaningful. */
  | "multiselect"
  /** Question/answer pairs. */
  | "faq"
  /** The two social-card text slots. */
  | "ogImage"
  /** Provenance links for a data-backed page. */
  | "sources"
  /** The Dataset JSON-LD payload, shown as named fields rather than JSON. */
  | "dataset"
  /** Another page in this section, or none. */
  | "parent"
  /** An image chosen from the media library. Stores its id, never a URL. */
  | "media"
  /** A whole number. */
  | "number";

export type FieldOption = { value: string; label: string };

export type FieldDescriptor = {
  /** Where the value lives. A bare name is a column on the document; a
   * `metadata.` prefix is a key inside the JSONB object. */
  path: string;
  label: string;
  kind: FieldKind;
  /** Shown under the input. Written for someone who does not know React or
   * SEO jargon — see the Phase 5 gate. */
  help?: string;
  required?: boolean;
  /** The body component this field feeds. Such a field is shown while the body
   * places that component — and required exactly then. `<Faq />` is where the
   * questions render and `<Fuentes />` is where the sources render, so a body
   * without the tag has nothing to fill in and nothing worth demanding.
   *
   * A field that already holds a value stays on screen whatever the body says:
   * hiding a control is a way to keep a form short, never a way to strand data
   * the editor can no longer reach. */
  placedBy?: string;
  /** Another field this one depends on, by path. Shown only while that field
   * has a value — `sortOrder` positions a page among its siblings, and a page
   * with no mother has none.
   *
   * Unlike `placedBy` there is no escape hatch for a value already set, because
   * there is nothing to strand: the number is submitted unchanged whether or
   * not the form shows it, and it comes back the moment a mother is chosen.
   * Most top-level pages carry a leftover order from when section listings
   * still read it, and honouring those would leave the field on screen almost
   * everywhere — which is the thing being fixed. */
  enabledBy?: string;
  /** Shown, but not editable and never sent in a patch.
   *
   * For a value that is set at creation and cannot be changed afterwards. The
   * slug is the only one today: changing it moves the page's public URL, and
   * every inbound link to the old one 404s until the redirects deferred in
   * cms.md §13.4 exist. Rendering it as a plain input while the store silently
   * dropped it was worse than either — the save reported success and nothing
   * changed. */
  readOnly?: boolean;
  /** Shown as a live counter, and the length the guidance is written around.
   * Not enforced here: the validator owns the rules, and this is the hint. */
  softMax?: number;
  placeholder?: string;
  options?: readonly FieldOption[];
  /** Fields in the same group render together under one heading. */
  group: "identidad" | "busqueda" | "social" | "estructura" | "contenido";
};

const GUIDE_FIELDS: readonly FieldDescriptor[] = [
  {
    path: "title",
    label: "Título",
    kind: "text",
    required: true,
    softMax: 60,
    group: "identidad",
    help: "El encabezado de la página y, salvo que definas un título para buscadores, también el que aparece en Google. Por encima de 60 caracteres Google lo corta.",
  },
  {
    path: "slug",
    label: "Dirección",
    kind: "slug",
    required: true,
    readOnly: true,
    group: "identidad",
    help: "La última parte de la URL. Se elige al crear la página y no se puede cambiar: los enlaces que ya apuntan aquí dejarían de funcionar.",
  },
  {
    path: "crumb",
    label: "Nombre corto",
    kind: "text",
    group: "identidad",
    help: "Cómo se nombra esta página en las migas y en los listados, cuando el título es demasiado largo. Si lo dejas vacío se usa el título.",
  },
  {
    path: "parentId",
    label: "Página madre",
    kind: "parent",
    group: "estructura",
    help: "Deja «Ninguna» para una página de primer nivel. Si eliges una, esta página cuelga de ella y su dirección empieza por la de la madre.",
  },
  {
    path: "sortOrder",
    label: "Orden",
    kind: "number",
    enabledBy: "parentId",
    group: "estructura",
    help: "En qué posición aparece entre las demás hijas de la misma madre. Menor va primero; si empatan, se ordenan por dirección.",
  },
  {
    path: "description",
    label: "Descripción",
    kind: "textarea",
    required: true,
    softMax: 160,
    group: "busqueda",
    help: "El párrafo que Google muestra debajo del título. Entre 120 y 170 caracteres.",
  },
  {
    path: "metadata.keywords",
    label: "Palabras clave",
    kind: "tags",
    required: true,
    group: "busqueda",
    help: "Entre 3 y 6. La primera es la búsqueda que esta página quiere ganar, y conviene que sus palabras aparezcan en el título y en la descripción.",
  },
  {
    path: "metadata.categories",
    label: "Categorías",
    kind: "multiselect",
    required: true,
    group: "busqueda",
    options: CATEGORIES.map((category) => ({
      value: category.id,
      label: category.label,
    })),
    help: "De 1 a 3. La primera decide en qué grupo aparece en el índice y qué miga muestra.",
  },
  {
    path: "canonicalSlug",
    label: "Página canónica",
    kind: "slug",
    group: "busqueda",
    help: "Solo si esta página compite con otra por la misma búsqueda y la otra es la respuesta. Escribe su dirección: esta seguirá viéndose, pero le cede el lugar en Google.",
  },
  {
    path: "titleTag",
    label: "Título para buscadores",
    kind: "text",
    softMax: 60,
    group: "busqueda",
    help: "Solo si el título funciona en la página pero es demasiado largo para un resultado de búsqueda.",
  },
  {
    path: "summary",
    label: "Resumen",
    kind: "textarea",
    required: true,
    group: "contenido",
    help: "Una o dos frases. Es lo que se lee en las tarjetas del índice.",
  },
  {
    path: "cta",
    label: "Frase de invitación",
    kind: "text",
    required: true,
    softMax: 54,
    group: "contenido",
    help: "La línea que acompaña al botón al principio del artículo. Por encima de 54 caracteres se parte en dos líneas.",
  },
  {
    path: "metadata.faq",
    label: "Preguntas frecuentes",
    kind: "faq",
    placedBy: "Faq",
    group: "contenido",
    help: "De 4 a 6 preguntas reales de búsqueda. Se muestran donde el cuerpo escribe <Faq />, y solo ahí. Las respuestas son texto plano: los enlaces van en el cuerpo.",
  },
  {
    path: "metadata.vendor",
    label: "Empresa",
    kind: "text",
    group: "social",
    help: "La empresa de la que trata la guía — «Edesur», «AySA». Déjalo vacío si la guía trata un tema y no una factura concreta.",
  },
  {
    path: "metadata.previewMediaId",
    label: "Imagen de portada",
    kind: "media",
    group: "social",
    help: "Opcional. Una imagen 16:9 de la biblioteca de medios. Se ve en los listados y junto al artículo.",
  },
  {
    path: "metadata.ogTitle",
    label: "Título para redes",
    kind: "text",
    softMax: 70,
    group: "social",
    help: "Solo si el gancho para compartir debería decir algo distinto del título.",
  },
  {
    path: "metadata.ogDescription",
    label: "Descripción para redes",
    kind: "textarea",
    softMax: 200,
    group: "social",
  },
  {
    path: "metadata.ogImage",
    label: "Tarjeta social",
    kind: "ogImage",
    group: "social",
    help: "Dos textos que se imprimen sobre la tarjeta que se genera al compartir. No es una imagen que subas.",
  },
];

// Statistics and research use the same editorial shell as a guide, but their
// credibility comes from a named dataset and links to the primary sources.
// Keep those values as regular form fields: an editor should never have to
// understand the JSONB representation to publish a data page.
const DATA_FIELDS: readonly FieldDescriptor[] = [
  {
    path: "title",
    label: "Título",
    kind: "text",
    required: true,
    softMax: 60,
    group: "identidad",
    help: "El encabezado de la página y, salvo que definas otro, el título que aparece en Google.",
  },
  {
    path: "slug",
    label: "Dirección",
    kind: "slug",
    required: true,
    readOnly: true,
    group: "identidad",
    help: "La última parte de la URL. Se elige al crear la página y no se puede cambiar: los enlaces que ya apuntan aquí dejarían de funcionar.",
  },
  {
    path: "crumb",
    label: "Nombre corto",
    kind: "text",
    group: "identidad",
    help: "El nombre que aparece en las migas y listados. Si queda vacío se usa el título.",
  },
  {
    path: "parentId",
    label: "Página madre",
    kind: "parent",
    group: "estructura",
    help: "Deja «Ninguna» para una página de primer nivel. Las páginas hijas forman una URL debajo de esta.",
  },
  {
    path: "sortOrder",
    label: "Orden",
    kind: "number",
    enabledBy: "parentId",
    group: "estructura",
    help: "La posición entre las demás hijas de la misma madre. Menor va primero.",
  },
  {
    path: "description",
    label: "Descripción",
    kind: "textarea",
    required: true,
    softMax: 160,
    group: "busqueda",
    help: "El resumen para buscadores y redes. Entre 120 y 170 caracteres.",
  },
  {
    path: "metadata.keywords",
    label: "Palabras clave",
    kind: "tags",
    required: true,
    group: "busqueda",
    help: "Términos por los que esta página debe poder encontrarse.",
  },
  {
    path: "canonicalSlug",
    label: "Página canónica",
    kind: "slug",
    group: "busqueda",
    help: "Solo si otra página es la respuesta principal a la misma búsqueda.",
  },
  {
    path: "titleTag",
    label: "Título para buscadores",
    kind: "text",
    softMax: 60,
    group: "busqueda",
    help: "Opcional, para acortar un titular largo en resultados de búsqueda.",
  },
  {
    path: "summary",
    label: "Resumen",
    kind: "textarea",
    required: true,
    group: "contenido",
    help: "Una o dos frases para tarjetas y páginas madre.",
  },
  {
    path: "cta",
    label: "Frase de invitación",
    kind: "text",
    required: true,
    softMax: 54,
    group: "contenido",
    help: "La línea que acompaña al botón al principio del artículo.",
  },
  {
    path: "metadata.sources",
    label: "Fuentes",
    kind: "sources",
    placedBy: "Fuentes",
    group: "contenido",
    help: "Las fuentes primarias del artículo. Se muestran donde el cuerpo escribe <Fuentes />, y solo ahí.",
  },
  {
    path: "metadata.dataset",
    label: "Conjunto de datos",
    kind: "dataset",
    required: true,
    group: "contenido",
    help: "Describe la serie que sostiene el análisis. Completa nombre, descripción, cobertura temporal y geográfica, y al menos una variable medida. Esto también genera los datos estructurados de la página.",
  },
  {
    path: "metadata.faq",
    label: "Preguntas frecuentes",
    kind: "faq",
    placedBy: "Faq",
    group: "contenido",
    help: "Las preguntas se muestran donde el cuerpo escribe <Faq />, y solo ahí.",
  },
  {
    path: "metadata.previewMediaId",
    label: "Imagen de portada",
    kind: "media",
    group: "social",
    help: "Opcional. Una imagen 16:9 de la biblioteca de medios.",
  },
  {
    path: "metadata.ogTitle",
    label: "Título para redes",
    kind: "text",
    softMax: 70,
    group: "social",
    help: "Opcional, si el gancho para compartir es distinto del título.",
  },
  {
    path: "metadata.ogDescription",
    label: "Descripción para redes",
    kind: "textarea",
    softMax: 200,
    group: "social",
  },
  {
    path: "metadata.ogStat",
    label: "Cifra destacada",
    kind: "text",
    group: "social",
    help: "Opcional. Un dato breve que se imprime en la tarjeta al compartir.",
  },
];

const FIELDS: Partial<Record<ContentSection, readonly FieldDescriptor[]>> = {
  guias: GUIDE_FIELDS,
  estadisticas: DATA_FIELDS,
  investigaciones: DATA_FIELDS,
};

export function sectionFields(
  section: ContentSection,
): readonly FieldDescriptor[] {
  return FIELDS[section] ?? [];
}

export const FIELD_GROUPS: readonly {
  id: FieldDescriptor["group"];
  label: string;
}[] = [
  { id: "identidad", label: "Identidad" },
  { id: "estructura", label: "Ubicación" },
  { id: "contenido", label: "Contenido" },
  { id: "busqueda", label: "Búsqueda" },
  { id: "social", label: "Redes" },
];

/** Whether the body places a content component, by the same test the validator
 * uses. `\b` after the name so `<Faq />` matches and `<FaqLista />` does not. */
function bodyPlaces(body: string, component: string): boolean {
  return new RegExp(`<${component}\\b`).test(body);
}

/** Whether a field is shown at all, and whether it is required once shown.
 *
 * The form used to ask for everything every section could ever need, so half of
 * a data page's sidebar was fields the page had no use for — an FAQ nobody
 * would see, an order among siblings a top-level page does not have. A field
 * whose condition is not met is not on screen, and a field that is not on
 * screen is not required either: the two answers are one decision, made here,
 * so the asterisk can never ask for something the form is hiding.
 *
 * Hiding never strands editorial data: a `placedBy` field holding a value stays
 * visible whatever the body says, which is how an editor removes an FAQ after
 * deleting the `<Faq />` tag instead of leaving questions in the database that
 * no page shows and no form reaches. Values are submitted either way — a hidden
 * field is left alone, never cleared. */
export function fieldState(
  field: FieldDescriptor,
  context: { body: string; values: Record<string, unknown> },
): { visible: boolean; required: boolean } {
  const required = field.required === true;

  if (field.placedBy) {
    const placed = bodyPlaces(context.body, field.placedBy);
    return {
      visible: placed || !isBlank(context.values[field.path]),
      required: placed,
    };
  }

  if (field.enabledBy) {
    return { visible: !isBlank(context.values[field.enabledBy]), required };
  }

  return { visible: true, required };
}

/** Read a field's value out of a document-shaped object, following the
 * `metadata.` prefix. One function so no component parses a path itself. */
export function readField(
  source: { metadata?: unknown } & Record<string, unknown>,
  path: string,
): unknown {
  if (!path.startsWith("metadata.")) return source[path];
  const metadata = (source.metadata ?? {}) as Record<string, unknown>;
  return metadata[path.slice("metadata.".length)];
}

/** Assemble a document patch from field values, splitting columns from the
 * JSONB object. The editor never builds that object by hand, which is what
 * keeps raw JSON out of the form. */
export function toPatch(
  fields: readonly FieldDescriptor[],
  values: Record<string, unknown>,
): { columns: Record<string, unknown>; metadata: Record<string, unknown> } {
  const columns: Record<string, unknown> = {};
  const metadata: Record<string, unknown> = {};
  for (const field of fields) {
    // A read-only field is displayed, never submitted. The store's update
    // whitelist would drop it anyway; leaving it in the patch meant the
    // hierarchy check ran against a slug that was never going to be written.
    if (field.readOnly) continue;
    const value = values[field.path];
    if (field.path.startsWith("metadata.")) {
      const key = field.path.slice("metadata.".length);
      // An empty optional field is *absent*, not an empty string: the schema
      // rejects `ogTitle: ""` precisely so a blank does not ship as a value.
      if (!isBlank(value)) metadata[key] = value;
    } else {
      // Drafts deliberately allow unfinished required copy. The database
      // columns for that copy are NOT NULL, though, so an empty description,
      // summary or CTA must remain an empty string for validation to report —
      // never become a database-level 500. Only genuinely nullable columns
      // use null to mean “not set”.
      columns[field.path] =
        isBlank(value) && NULLABLE_COLUMNS.has(field.path) ? null : value;
    }
  }
  return { columns, metadata };
}

const NULLABLE_COLUMNS = new Set([
  "titleTag",
  "canonicalSlug",
  "crumb",
  "parentId",
]);

function isBlank(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.keys(value).length === 0;
  return false;
}

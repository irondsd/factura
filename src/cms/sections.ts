import type { ContentSection } from "@/content-system/types";

// The CMS section registry.
//
// `/cms` lists these; `/cms/[section]/…` is one set of route files driven by
// them. Adding a section to the CMS — `noticias`, say — is an entry here plus
// its metadata schema and component registrations, not four new route files and
// a fourth copy of the editor.
//
// The URL segment mirrors the *public* path, so `/cms/investigaciones` edits
// what readers see at `/investigaciones`. An editor navigating the console
// should never have to hold two names for the same section in their head.
//
// That segment is not always the section id — research is `investigaciones`
// publicly and `investigacion` in the `cms_page.section` column, a plural the
// public URLs adopted and the data never did. This registry is the single place
// that mapping is written down; `findCmsSectionBySegment` is the only way to
// cross it, so no route file has to know about the exception.

export type CmsSectionStatus =
  /** Editable in the CMS today. */
  | "live"
  /** Registered so `/cms` can show what is coming, but not yet editable —
   * opening it is a 404 rather than a half-built editor. Section 12 flips
   * statistics and research to `live`. */
  | "planned";

export type CmsSection = {
  /** The `cms_page.section` value. What the data calls it. */
  id: ContentSection;
  /** The URL segment, under both `/cms` and the public site. */
  segment: string;
  /** Shown in the CMS. Spanish, like the rest of the console. */
  label: string;
  /** One line under the label on `/cms`. */
  description: string;
  /** Where these pages live on the public site. Not always `/${id}`. */
  publicPath: string;
  status: CmsSectionStatus;
};

export const CMS_SECTIONS: readonly CmsSection[] = [
  {
    id: "guias",
    segment: "guias",
    label: "Guías",
    description:
      "Artículos sobre cómo leer, pagar y entender las facturas del hogar.",
    publicPath: "/guias",
    status: "live",
  },
  {
    id: "estadisticas",
    segment: "estadisticas",
    label: "Estadísticas",
    description:
      "Páginas de datos: precios, alquileres, inflación y costos de construcción.",
    publicPath: "/estadisticas",
    status: "live",
  },
  {
    id: "investigacion",
    // Plural: the public section is `/investigaciones`, and the CMS follows the
    // reader-facing name rather than the column name.
    segment: "investigaciones",
    label: "Investigación",
    description: "Análisis propios a partir de los datos publicados.",
    publicPath: "/investigaciones",
    status: "live",
  },
];

/** Resolve a URL segment to a section. The only crossing between the public
 * name and the data name. */
export function findCmsSectionBySegment(
  segment: string,
): CmsSection | undefined {
  return CMS_SECTIONS.find((section) => section.segment === segment);
}

/** Resolve a `cms_page.section` value to its registry entry. */
export function findCmsSection(id: string): CmsSection | undefined {
  return CMS_SECTIONS.find((section) => section.id === id);
}

/** The sections an editor can actually open. `/cms/[section]` 404s for anything
 * else, so a planned section cannot be reached by typing its URL. */
export function findEditableSection(segment: string): CmsSection | undefined {
  const section = findCmsSectionBySegment(segment);
  return section?.status === "live" ? section : undefined;
}

/** Route helpers. They take the section *id* — what a `cms_page` row carries —
 * and emit the segment, so no caller has to remember the plural. */
const segmentOf = (id: ContentSection): string =>
  findCmsSection(id)?.segment ?? id;

export const cmsSectionPath = (id: ContentSection) => `/cms/${segmentOf(id)}`;
export const cmsNewPath = (id: ContentSection) => `/cms/${segmentOf(id)}/new`;
export const cmsEditPath = (id: ContentSection, pageId: string) =>
  `/cms/${segmentOf(id)}/${pageId}`;
export const cmsPreviewPath = (id: ContentSection, pageId: string) =>
  `/cms/${segmentOf(id)}/preview/${pageId}`;

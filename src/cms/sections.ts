import type { ContentSection } from "@/content-system/types";

// The CMS section registry.
//
// `/cms` lists these; `/cms/[section]/…` is one set of route files driven by
// them. Adding a section to the CMS — `noticias`, say — is an entry here plus
// its metadata schema and component registrations, not four new route files and
// a fourth copy of the editor.
//
// The URL segment is the section *id*, which is also the `cms_page.section`
// column, so a CMS URL and the row it edits always agree. That means one
// divergence from the public site: research lives at `/investigaciones`
// publicly but at `/cms/investigacion`, because `investigacion` is what the
// data calls it. `publicPath` below is the mapping, and it is the only place
// that discrepancy is spelled out.

export type CmsSectionStatus =
  /** Editable in the CMS today. */
  | "live"
  /** Registered so `/cms` can show what is coming, but not yet editable —
   * opening it is a 404 rather than a half-built editor. Section 12 flips
   * statistics and research to `live`. */
  | "planned";

export type CmsSection = {
  id: ContentSection;
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
    label: "Guías",
    description:
      "Artículos sobre cómo leer, pagar y entender las facturas del hogar.",
    publicPath: "/guias",
    status: "live",
  },
  {
    id: "estadisticas",
    label: "Estadísticas",
    description:
      "Páginas de datos: precios, alquileres, inflación y costos de construcción.",
    publicPath: "/estadisticas",
    status: "planned",
  },
  {
    id: "investigacion",
    label: "Investigación",
    description: "Análisis propios a partir de los datos publicados.",
    publicPath: "/investigaciones",
    status: "planned",
  },
];

export function findCmsSection(segment: string): CmsSection | undefined {
  return CMS_SECTIONS.find((section) => section.id === segment);
}

/** The sections an editor can actually open. `/cms/[section]` 404s for anything
 * else, so a planned section cannot be reached by typing its URL. */
export function findEditableSection(segment: string): CmsSection | undefined {
  const section = findCmsSection(segment);
  return section?.status === "live" ? section : undefined;
}

/** Route helpers, so a path is spelled once. */
export const cmsSectionPath = (section: ContentSection) => `/cms/${section}`;
export const cmsNewPath = (section: ContentSection) => `/cms/${section}/new`;
export const cmsEditPath = (section: ContentSection, id: string) =>
  `/cms/${section}/${id}`;
export const cmsPreviewPath = (section: ContentSection, id: string) =>
  `/cms/${section}/preview/${id}`;

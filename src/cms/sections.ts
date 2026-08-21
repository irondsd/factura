import type { ContentSection } from "@/content-system/types";

// The CMS section registry.
//
// `/cms` lists these; `/cms/[section]/…` is one set of route files driven by
// them. Adding a section to the CMS — `noticias`, say — is an entry here plus
// its metadata schema and component registrations, not four new route files and
// a fourth copy of the editor.
//
// A section id is its URL segment, under `/cms` and on the public site alike:
// `/cms/investigaciones` edits what readers see at `/investigaciones`. There is
// no mapping table because there is nothing to map — the id a `cms_page` row
// carries *is* the reader-facing name, and a new section's id is chosen in the
// plural for the same reason. An editor never holds two names for one section
// in their head, and no route file has to translate between them.

export type CmsSectionStatus =
  /** Editable in the CMS today. */
  | "live"
  /** Registered so `/cms` can show what is coming, but not yet editable —
   * opening it is a 404 rather than a half-built editor. */
  | "planned";

export type CmsSection = {
  /** The `cms_page.section` value, the URL segment under `/cms`, and the public
   * path's first segment. One name, three uses. */
  id: ContentSection;
  /** Shown in the CMS. Spanish, like the rest of the console. */
  label: string;
  /** One line under the label on `/cms`. */
  description: string;
  status: CmsSectionStatus;
};

export const CMS_SECTIONS: readonly CmsSection[] = [
  {
    id: "guias",
    label: "Guías",
    description:
      "Artículos sobre cómo leer, pagar y entender las facturas del hogar.",
    status: "live",
  },
  {
    id: "noticias",
    label: "Noticias",
    description: "Novedades y actualizaciones sobre Factura, facturas y el costo de vida.",
    status: "live",
  },
  {
    id: "estadisticas",
    label: "Estadísticas",
    description:
      "Páginas de datos: precios, alquileres, inflación y costos de construcción.",
    status: "live",
  },
  {
    id: "investigaciones",
    label: "Investigación",
    description: "Análisis propios a partir de los datos publicados.",
    status: "live",
  },
];

/** Resolve a `cms_page.section` value — equivalently, a URL segment — to its
 * registry entry. */
export function findCmsSection(id: string): CmsSection | undefined {
  return CMS_SECTIONS.find((section) => section.id === id);
}

/** The sections an editor can actually open. `/cms/[section]` 404s for anything
 * else, so a planned section cannot be reached by typing its URL. */
export function findEditableSection(id: string): CmsSection | undefined {
  const section = findCmsSection(id);
  return section?.status === "live" ? section : undefined;
}

/** Where a section's pages live on the public site. */
export const publicSectionPath = (id: ContentSection) => `/${id}`;

/** Route helpers, so no caller has to build a `/cms` URL by hand. */
export const cmsSectionPath = (id: ContentSection) => `/cms/${id}`;
export const cmsNewPath = (id: ContentSection) => `/cms/${id}/new`;
export const cmsEditPath = (id: ContentSection, pageId: string) =>
  `/cms/${id}/${pageId}`;
export const cmsPreviewPath = (id: ContentSection, pageId: string) =>
  `/cms/${id}/preview/${pageId}`;

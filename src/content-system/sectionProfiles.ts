import type { ContentSection } from "./types";

/** The few section differences that change editorial behavior.
 *
 * Section names belong here, not in consumers. A new section chooses a
 * profile once; the editor, validator and preview then get the same answer.
 * Component availability remains in the component manifest because it is a
 * component capability, not a page-profile concern. */
export type SectionProfile = {
  validation: "guide" | "news" | "data";
  newPageTemplate: "article" | "data";
  metadataAddons: readonly ("vendor" | "dataset" | "provider" | "reviews")[];
  /** Upper bound on `metadata.categories`. Three everywhere a category is a
   * topic; higher where it is a service a company sells, because one company
   * can honestly sell four or five of them. */
  maxCategories: number;
};

export const SECTION_PROFILES = {
  guias: {
    validation: "guide",
    newPageTemplate: "article",
    metadataAddons: ["vendor"],
    maxCategories: 3,
  },
  noticias: {
    validation: "news",
    newPageTemplate: "article",
    metadataAddons: [],
    maxCategories: 3,
  },
  estadisticas: {
    validation: "data",
    newPageTemplate: "data",
    metadataAddons: ["dataset"],
    maxCategories: 3,
  },
  investigaciones: {
    validation: "data",
    newPageTemplate: "data",
    metadataAddons: ["dataset"],
    maxCategories: 3,
  },
  // One page per company. Written and validated like a guide, and `vendor`
  // names the company the page is about — the same value its guides carry, so
  // the page can list them. Categories are the services it sells (luz, gas,
  // internet…): Telecentro alone sells four.
  proveedores: {
    validation: "guide",
    newPageTemplate: "article",
    metadataAddons: ["vendor", "provider", "reviews"],
    maxCategories: 5,
  },
} as const satisfies Record<ContentSection, SectionProfile>;

export function sectionProfile(section: ContentSection): SectionProfile {
  return SECTION_PROFILES[section];
}

export function sectionHasMetadataAddon(
  section: ContentSection,
  addon: SectionProfile["metadataAddons"][number],
): boolean {
  return sectionProfile(section).metadataAddons.includes(addon);
}

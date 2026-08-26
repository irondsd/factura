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
  metadataAddons: readonly ("vendor" | "dataset")[];
};

export const SECTION_PROFILES = {
  guias: {
    validation: "guide",
    newPageTemplate: "article",
    metadataAddons: ["vendor"],
  },
  noticias: {
    validation: "news",
    newPageTemplate: "article",
    metadataAddons: [],
  },
  estadisticas: {
    validation: "data",
    newPageTemplate: "data",
    metadataAddons: ["dataset"],
  },
  investigaciones: {
    validation: "data",
    newPageTemplate: "data",
    metadataAddons: ["dataset"],
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

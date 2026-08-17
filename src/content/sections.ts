import "server-only";
import { estadisticas } from "./estadisticas/pages";
import { investigacion } from "./investigacion/pages";
import type { ContentSection } from "./section";

// Every registry content section, in the order the site presents them. The one
// list the site-wide surfaces walk — the sitemap, the RSS feed and llms.txt all
// used to name /estadisticas explicitly, which is exactly what goes stale the
// day a second section ships.
//
// Statistics first, and everywhere: it is the older section, it carries more
// pages, and research pages are read *against* it — every one of them joins
// series that live over there.
export const SECTIONS: readonly ContentSection[] = [
  estadisticas,
  investigacion,
];

/** Resolve a section by its id, for the shared routes and the MDX components
 * that are handed one by name. Throws rather than returning `undefined`: every
 * caller has a literal id and a miss is a typo, not a runtime condition. */
export function sectionById(id: string): ContentSection {
  const section = SECTIONS.find((s) => s.id === id);
  if (!section) {
    throw new Error(
      `unknown content section "${id}" — known: ${SECTIONS.map((s) => s.id).join(", ")}`,
    );
  }
  return section;
}

import "server-only";
import { createSection, type SectionEntry } from "../section";

// The /investigacion registry. Same machinery as /estadisticas — see
// `content/section.ts` — and the same authoring format. What separates the two
// sections is what a page is *for*, and it is worth stating precisely because
// it is the only thing keeping them from becoming one section with two names:
//
//   • an /estadisticas page publishes **one series**. It explains what the
//     series measures, who publishes it and how often, draws it, and links back
//     to the source. It answers "what is the number".
//
//   • an /investigacion page **crosses several** and answers a question the
//     sources don't. It publishes no series of its own: its inputs are the
//     datasets already on disk, its output is arithmetic joining them, and the
//     thing it has to get right — and write down — is the method. It answers
//     "so which one should I pick".
//
// The practical test: if the page would still be worth publishing with the
// prose deleted, it is a statistic. If deleting the prose leaves numbers nobody
// can interpret, it is research and belongs here.
//
// Adding a page means adding its `.mdx` and one entry below. See AUTHORING.md.

/** Every research page, in the order the index lists them. */
const ENTRIES: SectionEntry[] = [
  {
    slug: ["barrios-subestimados-caba-2026"],
    crumb: "Barrios subestimados",
    file: "barrios-subestimados-caba-2026.mdx",
    load: () => import("./barrios-subestimados-caba-2026.mdx"),
  },
  {
    slug: ["barrios-seguros-baratos-caba"],
    crumb: "Barrios seguros y baratos",
    file: "barrios-seguros-baratos-caba.mdx",
    load: () => import("./barrios-seguros-baratos-caba.mdx"),
  },
];

export const investigacion = createSection({
  id: "investigacion",
  label: "Investigación",
  backLabel: "← Todas las investigaciones",
  relatedLabel: "Investigación relacionada",
  entries: ENTRIES,
});

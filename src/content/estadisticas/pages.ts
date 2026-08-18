import "server-only";
import { createSection, type SectionEntry } from "../section";

// The /estadisticas registry. The machinery — how a path resolves to an `.mdx`,
// how the breadcrumb is walked, how the reading time and the table of contents
// are derived — lives in `content/section.ts` and is shared with
// /investigacion. What is here is this section's own list of pages, in the order
// the index shows them, and its own name for itself.
//
// Adding a page means adding its `.mdx` and one entry below. See AUTHORING.md.

/** Every statistics page, in the order the index lists them. */
const ENTRIES: SectionEntry[] = [
  {
    slug: ["inflacion-de-vivienda"],
    crumb: "Inflación de vivienda",
    file: "inflacion-de-vivienda.mdx",
    load: () => import("./inflacion-de-vivienda.mdx"),
  },
  // The six regions, in the order INDEC lists them — which is also the order the
  // hub's own charts and tables use, so a reader moving between the two never
  // has to re-learn where a region sits.
  {
    slug: ["inflacion-de-vivienda", "gba"],
    crumb: "GBA",
    file: "inflacion-de-vivienda/gba.mdx",
    load: () => import("./inflacion-de-vivienda/gba.mdx"),
  },
  {
    slug: ["inflacion-de-vivienda", "pampeana"],
    crumb: "Pampeana",
    file: "inflacion-de-vivienda/pampeana.mdx",
    load: () => import("./inflacion-de-vivienda/pampeana.mdx"),
  },
  {
    slug: ["inflacion-de-vivienda", "noreste"],
    crumb: "Noreste",
    file: "inflacion-de-vivienda/noreste.mdx",
    load: () => import("./inflacion-de-vivienda/noreste.mdx"),
  },
  {
    slug: ["inflacion-de-vivienda", "noroeste"],
    crumb: "Noroeste",
    file: "inflacion-de-vivienda/noroeste.mdx",
    load: () => import("./inflacion-de-vivienda/noroeste.mdx"),
  },
  {
    slug: ["inflacion-de-vivienda", "cuyo"],
    crumb: "Cuyo",
    file: "inflacion-de-vivienda/cuyo.mdx",
    load: () => import("./inflacion-de-vivienda/cuyo.mdx"),
  },
  {
    slug: ["inflacion-de-vivienda", "patagonia"],
    crumb: "Patagonia",
    file: "inflacion-de-vivienda/patagonia.mdx",
    load: () => import("./inflacion-de-vivienda/patagonia.mdx"),
  },
  // Flat rather than ["venta", "caba"]: the series is CABA-only, and a national
  // `/estadisticas/venta` hub with one child and nothing of its own to say is a
  // doorway. If a province ever publishes a comparable series, this becomes
  // `venta/caba` plus a permanent redirect from here.
  {
    slug: ["precio-m2-caba"],
    crumb: "Precio del m² en CABA",
    file: "precio-m2-caba.mdx",
    load: () => import("./precio-m2-caba.mdx"),
  },
  // The same question one jurisdiction over, and the reason the page above
  // can't just be renamed: the province has no official series, so this one is
  // built on a portal's index and has to say so on every figure. Flat rather
  // than nested under a `precio-m2` hub — two siblings don't need a parent, and
  // a hub whose only content is "here are the two" is a doorway.
  {
    slug: ["precio-m2-provincia-buenos-aires"],
    crumb: "Precio del m² en Provincia",
    file: "precio-m2-provincia-buenos-aires.mdx",
    load: () => import("./precio-m2-provincia-buenos-aires.mdx"),
  },
  // The cost side of the same market, and flat for the same reason as its
  // neighbours: the series is CABA-only. Straight after the sale-price page
  // because it is the other half of "what does a square metre cost" — that one
  // is what a finished metre sells for, this one what it costs to build, and the
  // two are joined on a map that only exists because both are on disk.
  {
    slug: ["precio-m2-construccion-caba"],
    crumb: "Costo de construcción",
    file: "precio-m2-construccion-caba.mdx",
    load: () => import("./precio-m2-construccion-caba.mdx"),
  },
  // The other half of the same question, and flat for the same reason: the
  // series is CABA-only. The two link to each other with <PaginaRelacionada />.
  {
    slug: ["alquiler-caba"],
    crumb: "Alquileres en CABA",
    file: "alquiler-caba.mdx",
    load: () => import("./alquiler-caba.mdx"),
  },
  // The other question about the same market: not what a flat costs but
  // whether there is one. Flat for the same reason as its neighbours, and next
  // to the rent page because the two are read together — that one can only
  // colour the barrios with enough listings to price, and this one covers all
  // 48 because a total is never suppressed.
  {
    slug: ["oferta-alquiler-caba"],
    crumb: "Oferta de alquiler",
    file: "oferta-alquiler-caba.mdx",
    load: () => import("./oferta-alquiler-caba.mdx"),
  },
  // The same series as the page above, read down its time axis instead of
  // across its map — and the one page in the section that is a history rather
  // than a lookup. Directly after the map it shares a dataset with, so a reader
  // who has just found their barrio can carry on into what happened to it.
  {
    slug: ["historia-oferta-alquiler-caba"],
    crumb: "Historia de la oferta",
    file: "historia-oferta-alquiler-caba.mdx",
    load: () => import("./historia-oferta-alquiler-caba.mdx"),
  },
  // The two price pages above, divided. Last because it depends on both: it publishes no
  // series of its own, and its page is largely about the arithmetic joining
  // them. Flat for the same reason as its two inputs.
  // The other thing a reader compares barrios on, and the only page in the
  // section whose series isn't a price. Flat for the same reason as its
  // neighbours: the Mapa del Delito is a CABA dataset and no province publishes
  // anything comparable. It sits after the property pages because it is read
  // against them — the map is drawn on the same geography, so a reader can put
  // "what does it cost here" and "what gets recorded here" side by side.
  {
    slug: ["delitos-caba"],
    crumb: "Delitos en CABA",
    file: "delitos-caba.mdx",
    load: () => import("./delitos-caba.mdx"),
  },
  {
    slug: ["rentabilidad-alquiler-caba"],
    crumb: "Rentabilidad del alquiler",
    file: "rentabilidad-alquiler-caba.mdx",
    load: () => import("./rentabilidad-alquiler-caba.mdx"),
  },
];

export const estadisticas = createSection({
  id: "estadisticas",
  label: "Estadísticas",
  backLabel: "← Todas las estadísticas",
  relatedLabel: "Estadística relacionada",
  entries: ENTRIES,
});

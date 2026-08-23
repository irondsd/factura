// The guide taxonomy. Categories behave like tags: a guide declares one to three
// of them in `meta.categories`, and the FIRST one is its *primary* category —
// the one that decides where it's grouped on the /guias index and which crumb
// appears in its breadcrumb trail. The rest widen its reach (category pages,
// related guides) without moving it.
//
// Deliberately NOT `server-only`: `scripts/validate-guides.ts` imports the ids
// to check every guide against them, so this module has to stay plain (no fs, no
// node built-ins) and importable from anywhere.
//
// Adding a category is a registry edit plus tagging the files — no URL changes
// for the existing ones. Land the entry together with its first guide: a
// category with nothing in it renders nothing (consumers skip empty ones), so an
// early entry is harmless but pointless.
//
// *Renaming* an id is three things, and none of them are optional: the entry
// here, a redirect from the old /guias/categoria/<id> in `next.config.ts`, and
// `scripts/renameGuideCategories.ts` run against every database. The ids live in
// `cms_page_revision.metadata`, which is parsed against this list on read — a
// row still holding a retired id makes the guide throw, not degrade.

type CategoryFields = {
  /** Stable id. Doubles as the URL slug, so: lowercase, hyphens, no accents. */
  id: string;
  /** Short chip/section label. */
  label: string;
  /** <title> and <h1> of the category page. */
  title: string;
  /** <meta name="description"> for the category page. ~140–160 chars. */
  description: string;
};

/** Every category, in the order they're displayed on the /guias index. This is
 * editorial ordering (biggest, most-searched topics first), not alphabetical. */
export const CATEGORIES = [
  {
    id: "expensas",
    label: "Expensas",
    title: "Expensas: guías para entender tu liquidación",
    description:
      "Guías sobre las expensas de un edificio en Argentina: qué son, qué incluyen, cómo se calculan y cómo controlar los gastos comunes de tu consorcio.",
  },
  {
    id: "servicios",
    label: "Servicios del hogar",
    title: "Servicios del hogar: luz, gas, agua e internet",
    description:
      "Guías para entender las facturas de los servicios del hogar en Argentina: electricidad, gas, agua e internet, con un ejemplo de cada boleta.",
  },
  {
    id: "impuestos",
    label: "Impuestos y tasas",
    title: "Impuestos y tasas del hogar en la Ciudad de Buenos Aires",
    description:
      "Guías sobre los impuestos que llegan a tu casa en CABA: Inmobiliario/ABL y Patentes de AGIP, cómo leer la boleta, cómo pagarla y qué descuentos existen.",
  },
  {
    id: "subsidios",
    label: "Subsidios y tarifa social",
    title: "Subsidios de luz, gas y agua: quién accede y cómo pedirlos",
    description:
      "Guías sobre los subsidios energéticos en Argentina: el régimen SEF de luz, gas y garrafa, el registro ReSEF y la tarifa social de agua de AySA.",
  },
  {
    id: "mercado-y-precios",
    label: "Mercado y precios",
    title: "Mercado y precios: qué le pasa a lo que pagas cada mes",
    description:
      "Guías sobre los precios de los servicios del hogar en Argentina: cuánto subieron la luz, el gas, el agua y las expensas, y cómo medir tu propia inflación.",
  },
  {
    id: "facturas-y-conceptos",
    label: "Facturas y conceptos",
    title: "Facturas y conceptos: qué dice cada parte de la boleta",
    description:
      "Guías para leer cualquier factura y entender sus conceptos: dónde mirar el total, el vencimiento y el consumo, y qué significa cada cargo del detalle.",
  },
  {
    id: "finanzas",
    label: "Finanzas",
    title: "Finanzas del hogar: ahorro y control de los gastos",
    description:
      "Guías para manejar la plata de tu casa: comparar valores de referencia, detectar cargos indebidos y seguir la evolución de tus gastos mes a mes.",
  },
  {
    id: "tramites-y-gestiones",
    label: "Trámites y gestiones",
    title: "Trámites y gestiones: cómo pagar y digitalizar facturas",
    description:
      "Guías prácticas para resolver las gestiones de tus facturas: cómo pagar online de forma segura y cómo digitalizar tus comprobantes en papel.",
  },
  {
    id: "estafas",
    label: "Estafas y fraudes",
    title: "Estafas inmobiliarias y fraudes con los servicios del hogar",
    description:
      "Guías para reconocer y evitar las estafas más comunes con la vivienda en Argentina: alquileres falsos, inmobiliarias no registradas y facturas apócrifas.",
  },
] as const satisfies readonly CategoryFields[];

/** Union of the valid `meta.categories` values. */
export type CategoryId = (typeof CATEGORIES)[number]["id"];

/** A category, with `id` narrowed to the ids that actually exist — so anything
 * holding a `Category` can pass its id straight to the lookups below. */
export type Category = CategoryFields & { id: CategoryId };

/** Just the ids, in display order. */
export const CATEGORY_IDS: readonly CategoryId[] = CATEGORIES.map((c) => c.id);

export function isCategoryId(value: string): value is CategoryId {
  return CATEGORY_IDS.includes(value as CategoryId);
}

/** Look up a category by id. Returns `undefined` for unknown ids so routes can
 * 404 rather than throw. */
export function getCategory(id: string): Category | undefined {
  return CATEGORIES.find((c) => c.id === id);
}

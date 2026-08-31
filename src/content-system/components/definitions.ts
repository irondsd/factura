import { z } from "zod";
import { chartIdSchema } from "../metadata/guias";
import type { ContentSection } from "../types";
import { SECTION_COMPONENT_NAMES } from "./sectionDefinitions";

// The content component manifest, *without* the components (cms.md).
//
// Split from `./manifest.tsx` deliberately. Grammar validation needs the names,
// the sections, the children rule and the property schemas — and it runs in
// places that must not import React: the CMS validator, the CMS MCP, and the
// importer. Rendering needs the bindings, and gets them from
// `./manifest.tsx`, which merges the two halves back together.
//
// Adding a component means adding it here and to the bindings there; the
// `satisfies` in the manifest will not compile with one but not the other.

/** Whether a component may wrap markdown children. `leaf` components are
 * written self-closing and a body between tags is an error rather than
 * something silently dropped. */
export type ComponentKind = "leaf" | "container";

/** Presentation metadata for source-editor completion. This is deliberately
 * kept beside the component definition: a new component should teach the CMS
 * how to insert and explain itself at the same place that defines its allowed
 * sections and props. These fields never affect rendering or validation. */
export type ComponentAuthoringGroup =
  | "article-structure"
  | "calls-to-action"
  | "charts-summaries"
  | "maps"
  | "tables-comparisons";

export type ComponentAuthoringMetadata = {
  /** What the component is called in the editor, in the author's language.
   * Required: the fallback used to be the JSX name with the capitals split
   * apart, which for `SueloPbaContraste` read as a variable name rather than
   * as a figure. */
  label: string;
  /** Which bucket of the insert palette it appears under. Required, because
   * the fallback used to be a regular expression over the component's name —
   * so renaming a component silently re-bucketed it. */
  group: ComponentAuthoringGroup;
  rank?: number;
  propertyDescriptions?: Readonly<Record<string, string>>;
  propertyPlaceholders?: Readonly<Record<string, string>>;
  /** Optional properties that are useful enough to include in a new snippet. */
  defaultProps?: Readonly<Record<string, string | boolean>>;
  childPlaceholder?: string;
  notes?: readonly string[];
  /** A complete CodeMirror snippet, for components whose default shape is
   * more useful than the generic leaf/container template. */
  template?: string;
};

export type ContentComponentDefinition = {
  sections: readonly ContentSection[];
  kind: ComponentKind;
  /** Validates the literal attributes written in the MDX. Always `.strict()`:
   * an unknown property is a typo that would otherwise render nothing. */
  props: z.ZodType;
  /** Shown in the CMS component help and used in the MCP tool instructions.
   * One sentence saying what this component puts on the page and why an author
   * would reach for it rather than for one of the sixty others. */
  description: string;
  /** How the editor presents it. Not optional: a component nobody can find in
   * the palette, or that lands in the wrong bucket, is a component that does
   * not exist as far as an author is concerned. */
  authoring: ComponentAuthoringMetadata;
};

const noProps = z.object({}).strict();

/** Components whose props the *article route* binds, not the author. The MDX
 * writes a bare tag and the page supplies the data — `useMDXComponents()` takes
 * no arguments, so there is no other way for a component to know which article
 * it is in. Any attribute written on one of these is a mistake. */
const CONTEXT_BOUND = noProps;

const DATA_SECTIONS = [
  "estadisticas",
  "investigaciones",
] as const satisfies readonly ContentSection[];
/** One statistics or research figure: a leaf the author writes bare, bound to
 * its own dataset and to the one page it belongs on.
 *
 * Each one is spelled out rather than generated because the generated version
 * gave all sixty-three the same sentence — "Registered statistics/research
 * visualization or data table" — which told an author nothing about which of
 * the sixty-three to reach for, and left `descriptors.ts` guessing their
 * editor group from a regular expression over the component's name. A figure's
 * label is what the figure is called on the page; its description is what it
 * shows and why it is there. */
const dataFigure = (
  group: ComponentAuthoringGroup,
  label: string,
  description: string,
): ContentComponentDefinition => ({
  sections: DATA_SECTIONS,
  kind: "leaf",
  props: noProps,
  description,
  authoring: { label, group },
});

/** Every registered section component except the four the manifest describes by
 * hand — the two with props and the two shared with guides. Spelled as a type
 * so the record below is exhaustive in both directions: a name added to
 * `SECTION_COMPONENT_NAMES` without an entry here fails to compile, and so does
 * an entry for a name that is not registered. That is the guarantee the
 * generated version gave for free, kept now that the entries are written out. */
type DataFigureName = Exclude<
  (typeof SECTION_COMPONENT_NAMES)[number],
  "ClosingCta" | "PaginaRelacionada" | "IpcViviendaChart" | "ResumenRegion"
>;

const DATA_LEAF_COMPONENTS: Record<DataFigureName, ContentComponentDefinition> =
  {
    AbsaComercialCoeficiente: dataFigure(
      "tables-comparisons",
      "De dónde sale el aumento de los comercios",
      "The February rise decomposed into the tariff increase everyone reported and the non-residential coefficient change nobody did. Three rows that multiply to the centavo.",
    ),
    AbsaCuadroTarifario: dataFigure(
      "tables-comparisons",
      "Todos los valores del m³ de ABSA",
      "Every value the metro cúbico has taken since December 2024, with the norm that set it and whether it can still be verified on ABSA's own cuadro tarifario.",
    ),
    AbsaTarifaHistoria: dataFigure(
      "charts-summaries",
      "Historia del valor del m³ de ABSA",
      "The tariff as the staircase it is: seven decrees in twenty-one months, each holding flat until the next. Place it wherever the page first shows the series.",
    ),
    AbsaTarifaVsInflacion: dataFigure(
      "charts-summaries",
      "La tarifa de ABSA contra la inflación",
      "The same series measured against general prices, switchable between the two indexed lines and the gap between them. The figure that shows February 2026 as a correction rather than an increase.",
    ),
    AlquilerCabaMapa: dataFigure(
      "maps",
      "Mapa del alquiler en CABA",
      "Shaded map of asking rents across the 48 barrios and 15 comunas, with switches for unit size and geography, and the same figures as a table underneath.",
    ),
    AlquileresBuscados: dataFigure(
      "tables-comparisons",
      "Alquiler en los barrios más consultados",
      "Short table of the six most looked-up barrios with their monthly rent, their rent per m² and their position among the barrios IDECBA priced this quarter.",
    ),
    OfertaCobertura: dataFigure(
      "charts-summaries",
      "Cobertura del relevamiento de alquiler",
      "How many barrios had a publishable rent each quarter. Place it wherever the page has to explain why a barrio is missing from the map.",
    ),
    VentaCabaMapa: dataFigure(
      "maps",
      "Mapa del precio del m² en CABA",
      "Shaded map of the asking price per square metre by barrio and comuna, switchable by unit size, with the full table below it.",
    ),
    BarriosBuscados: dataFigure(
      "tables-comparisons",
      "Precio del m² en los barrios más consultados",
      "The six most looked-up barrios with their price per m², the price of a whole flat at the reference surface, and their rank among priced barrios.",
    ),
    PrecioPorZona: dataFigure(
      "tables-comparisons",
      "Precio del m² por zona de la Ciudad",
      "The city in four rows — norte, centro, oeste, sur — with each zone's middle barrio and the spread between its cheapest and dearest.",
    ),
    PrecioDepartamento: dataFigure(
      "tables-comparisons",
      "Cuánto cuesta un departamento en CABA",
      "Price of a whole flat by unit size, with the reference surface each figure assumes. The answer for a reader who does not think in square metres.",
    ),
    VentaPbaMapa: dataFigure(
      "maps",
      "Mapa del precio del m² en el Gran Buenos Aires",
      "Shaded map of the asking price per square metre across the partidos of the Gran Buenos Aires, with the table of every priced partido below.",
    ),
    VentaPbaHistoria: dataFigure(
      "charts-summaries",
      "Historia del precio del m² en el GBA",
      "The same partidos as the map read down their time axis, for the page's «how did we get here» section.",
    ),
    PartidosBuscados: dataFigure(
      "tables-comparisons",
      "Precio del m² en los partidos más consultados",
      "The most looked-up partidos with their price per m², the price of a two-ambiente flat and their rank among the partidos priced this month.",
    ),
    PrecioPartidoZona: dataFigure(
      "tables-comparisons",
      "Precio del m² por zona del GBA",
      "The Gran Buenos Aires grouped into zones, each with its middle partido and its dearest and cheapest.",
    ),
    PrecioDepartamentoPba: dataFigure(
      "tables-comparisons",
      "Cuánto cuesta un departamento en el GBA",
      "Price of a whole flat by zone and unit size, with the reference surface each figure assumes.",
    ),
    OfertaAlquilerCabaMapa: dataFigure(
      "maps",
      "Mapa de la oferta de alquiler en CABA",
      "Shaded map of how much is advertised for rent in each barrio, which is a map of supply rather than of price.",
    ),
    OfertaPorZona: dataFigure(
      "tables-comparisons",
      "Dónde se concentra la oferta de alquiler",
      "Supply by zone with each zone's share of the city total and the barrio that concentrates most of it.",
    ),
    OfertaCambio: dataFigure(
      "tables-comparisons",
      "Cuánto cayó y cuánto volvió cada barrio",
      "Every barrio indexed against its own 2016–2019 average, so a small barrio and a large one are on the same scale.",
    ),
    OfertaComposicion: dataFigure(
      "tables-comparisons",
      "De qué está hecha la oferta",
      "The mix of unit sizes across the three windows, closed by a totals row — because the mix moved far less than the size of the market did.",
    ),
    OfertaHistoria: dataFigure(
      "charts-summaries",
      "Serie de la oferta de alquiler en CABA",
      "Flats advertised for rent month by month, the series that spans the Ley de Alquileres and its repeal.",
    ),
    RentabilidadCabaMapa: dataFigure(
      "maps",
      "Mapa de rentabilidad del alquiler en CABA",
      "Shaded map of gross rental yield by barrio, with the payback in years and the table of every barrio that has both prices.",
    ),
    RentabilidadBuscados: dataFigure(
      "tables-comparisons",
      "Qué rinde en los barrios más consultados",
      "The six most looked-up barrios by yield, payback and flat price — the one list where their order is close to the reverse of the price pages'.",
    ),
    RentabilidadHistoria: dataFigure(
      "charts-summaries",
      "Historia de la rentabilidad en CABA",
      "Gross yield for the city quarter by quarter, so a level can be read against its own past rather than against a headline.",
    ),
    RentabilidadDispersion: dataFigure(
      "charts-summaries",
      "Rentabilidad contra precio del barrio",
      "Yield plotted against price per m² for every comparable barrio: the dearer the barrio, the less it returns.",
    ),
    RentabilidadTipoCambio: dataFigure(
      "charts-summaries",
      "La misma serie con tres tipos de cambio",
      "The yield series recomputed at three exchange rates, for the section that has to say how much the dollar choice moves the answer.",
    ),
    RentabilidadContraste: dataFigure(
      "tables-comparisons",
      "Los mismos barrios, medidos por otra fuente",
      "This page's yields beside a commercial portal's for the barrios both publish, with the gap in a third column.",
    ),
    CostoConstruccionMapa: dataFigure(
      "maps",
      "Mapa de obra y terreno en CABA",
      "Shaded map of how much of a square metre's price is the building and how much is the ground under it.",
    ),
    CostoConstruccionResumen: dataFigure(
      "tables-comparisons",
      "Costo de construcción del m² en CABA",
      "The reference building models with their cost per m² in pesos, the dollar equivalent and the year-on-year change.",
    ),
    CostoConstruccionHistoria: dataFigure(
      "charts-summaries",
      "Historia del costo de construcción",
      "The construction cost series, which in pesos is mostly a picture of inflation and needs its dollar view to be read.",
    ),
    CostoCapitulos: dataFigure(
      "charts-summaries",
      "Qué empuja el costo, capítulo por capítulo",
      "Each chapter of the cost index against the general one, so a reader can see which trade is pulling the total.",
    ),
    CostoPorZona: dataFigure(
      "tables-comparisons",
      "Obra y terreno por zona de la Ciudad",
      "The city's four zones with the share of a square metre that is construction and what is left for the land.",
    ),
    DelitosCabaMapa: dataFigure(
      "maps",
      "Mapa del delito en CABA",
      "Shaded map of recorded offences per 1.000 residents by barrio and comuna, switchable by offence type.",
    ),
    DelitosResumen: dataFigure(
      "tables-comparisons",
      "Delitos registrados en la Ciudad",
      "The city's year by offence type with the change against the year before, closed by a total, plus the two categories that deliberately sit outside it.",
    ),
    DelitosPorZona: dataFigure(
      "tables-comparisons",
      "Delitos por zona de la Ciudad",
      "The four zones by rate, each against the city average, with the highest and lowest barrio inside it.",
    ),
    DelitosResidentes: dataFigure(
      "tables-comparisons",
      "Delitos y habitantes, barrio por barrio",
      "Each barrio's share of recorded crime beside its share of residents. The correction the map needs: a rate per resident is not a risk to a resident.",
    ),
    DelitosHistoria: dataFigure(
      "charts-summaries",
      "Diez años de delito en la Ciudad",
      "The whole decade, because any reading that starts after 2020 is measuring the end of a lockdown.",
    ),
    DelitosCuando: dataFigure(
      "charts-summaries",
      "A qué hora se registran los delitos",
      "The distribution across the day by offence type, with the weekday spread noted beneath it.",
    ),
    DelitosRobos: dataFigure(
      "tables-comparisons",
      "Cómo se roba: moto y arma",
      "What share of robberies involved a motorcycle and what share a firearm, year by year — the only public count of the motochorro.",
    ),
    EscriturasResumen: dataFigure(
      "tables-comparisons",
      "Escrituras de los últimos doce meses",
      "The last twelve months of deeds with the year-on-year change, mortgages and the share of purchases that used one. Provisional months are marked.",
    ),
    EscriturasHistoria: dataFigure(
      "charts-summaries",
      "Veintiún años del mercado bonaerense",
      "The monthly series since 2005, with the two months that are not market — a registry strike and April 2020 — flagged.",
    ),
    EscriturasAnual: dataFigure(
      "charts-summaries",
      "Escrituras por año",
      "Deeds counted by year: no deflating, no converting, no smoothing. The view that is hardest to argue with.",
    ),
    EscriturasEstacionalidad: dataFigure(
      "charts-summaries",
      "Por qué diciembre no es un boom",
      "The size of the calendar effect, which is what makes any non-interannual comparison of this series meaningless.",
    ),
    EscriturasHipotecas: dataFigure(
      "charts-summaries",
      "Cuánto del mercado se mueve con hipoteca",
      "The share of operations backed by a mortgage since 2005 — Argentine credit switching on and off twice.",
    ),
    EscriturasMonto: dataFigure(
      "charts-summaries",
      "Valor promedio declarado por escritura",
      "The declared amount divided by the number of acts, in dollars, with every caveat that average needs.",
    ),
    SueloPbaMapa: dataFigure(
      "maps",
      "Mapa del m² de terreno en la Provincia",
      "Shaded map of the median asking price per square metre of land across all 135 partidos, with the two kinds of blank distinguished in the note.",
    ),
    SueloPbaLotes: dataFigure(
      "tables-comparisons",
      "Cuánto cuesta un terreno, por partido",
      "The price of a whole plot grouped by coast, interior and metropolitan edge — a different arithmetic from the price per metre, and it says so.",
    ),
    SueloPbaInterior: dataFigure(
      "tables-comparisons",
      "El resto de la provincia",
      "Land price per m² for the partidos outside the metropolitan area, with the usual range beside each median.",
    ),
    SueloPbaContraste: dataFigure(
      "tables-comparisons",
      "Cuánta tierra compra un m² de departamento",
      "Land against built space in the same partido, which is the comparison that makes a land price mean something.",
    ),
    SueloCordobaResumen: dataFigure(
      "tables-comparisons",
      "Valor de la tierra urbana en Córdoba",
      "IDECOR's cluster medians for the province, grouped, in pesos and dollars per m². Reproduces the official synthesis rather than averaging it.",
    ),
    SueloNeuquenBarrios: dataFigure(
      "charts-summaries",
      "Estimación del suelo por barrio en Neuquén",
      "A source-dated heatmap of the 49 barrios of Neuquén Capital, with the exact values repeated as text.",
    ),
    ResumenIpc: dataFigure(
      "tables-comparisons",
      "Resumen del IPC de vivienda",
      "The last published month for every region at once — the row a reader wants before they reach a single chart.",
    ),
    RegionesIpc: dataFigure(
      "tables-comparisons",
      "Qué incluye cada región",
      "Which districts INDEC puts in each region. For the methodology section, so the prose and the series describe the same six regions.",
    ),
    ComparacionRegiones: dataFigure(
      "charts-summaries",
      "Las seis regiones, una al lado de la otra",
      "The regions compared for one period, for the section that asks where prices moved most.",
    ),
    MultiploRegiones: dataFigure(
      "charts-summaries",
      "Cuántas veces se multiplicó cada región",
      "The accumulated multiple per region over the whole series, as text rather than as a chart.",
    ),
    PrecioSeguridadMapa: dataFigure(
      "maps",
      "Dónde conviene alquilar según precio y delitos",
      "The combined score by barrio, shaded, with every region and its score listed underneath.",
    ),
    PrecioSeguridadResumen: dataFigure(
      "tables-comparisons",
      "Las dos variables, y por qué no se pueden sumar",
      "Rent and crime side by side with their spreads, which is the figure that justifies working in ranks rather than in levels.",
    ),
    PrecioSeguridadRanking: dataFigure(
      "tables-comparisons",
      "El ranking, con el cálculo a la vista",
      "Both ends of the ranking with the price position, the safety position and the levels behind them, so the score can be checked rather than trusted.",
    ),
    PrecioSeguridadDispersion: dataFigure(
      "charts-summaries",
      "Lo que el mercado ya cobra por la seguridad",
      "Rent per m² against recorded crime for every comparable barrio, with the fitted line and the cheap-and-quiet quadrant marked.",
    ),
    PrecioSeguridadCobertura: dataFigure(
      "tables-comparisons",
      "Los barrios que el ranking no puede ver",
      "The barrios without a publishable rent, ordered by how quiet they are — the page's second-best list rather than an apology.",
    ),
    PrecioSeguridadSensibilidad: dataFigure(
      "tables-comparisons",
      "¿Cambia la respuesta si cambian los supuestos?",
      "The same ranking recomputed for every unit size and every crime cut, so the names that survive all six are visible.",
    ),
    SeguridadPorDelitoGanadores: dataFigure(
      "charts-summaries",
      "El barrio más calmo cambia con el delito",
      "Which barrio comes out calmest depends on which offence you count — the finding the whole page rests on.",
    ),
    SeguridadPorDelitoComparacion: dataFigure(
      "tables-comparisons",
      "Los perfiles que el promedio esconde",
      "Barrios by robbery, theft and offences against persons separately, with rent beside them.",
    ),
    BarriosSubestimadosResumen: dataFigure(
      "tables-comparisons",
      "Cuatro barrios, cuatro formas de rendir más",
      "The shortlist with rent, crime and the advantage that does not show up in the price.",
    ),
    BarriosSubestimadosPerfiles: dataFigure(
      "charts-summaries",
      "Perfil de cada barrio",
      "One profile per shortlisted barrio, for the section that argues each case in prose.",
    ),
    BarriosSubestimadosContraste: dataFigure(
      "charts-summaries",
      "Los que quedaron en la puerta",
      "The barrios that nearly made the shortlist and why they did not — what keeps the selection from looking arbitrary.",
    ),
    BarriosSubestimadosComparador: dataFigure(
      "charts-summaries",
      "Cambiá la prioridad, no los datos",
      "An interactive re-weighting of the same barrios, so a reader can put their own priority in and see the order change.",
    ),
  };

export const CONTENT_COMPONENT_DEFINITIONS = {
  // ── guides ────────────────────────────────────────────────────────────────
  ClosingCta: {
    sections: ["guias", "noticias", "estadisticas", "investigaciones"],
    kind: "container",
    props: z
      .object({
        title: z.string().min(1).optional(),
      })
      .strict(),
    description:
      "Closing call to action. Give it a guide-specific `title` and two sentences of body copy; without them it falls back to generic wording.",
    authoring: {
      label: "Cierre con CTA",
      group: "article-structure",
      rank: 60,
      defaultProps: { title: "Título específico" },
      childPlaceholder: "Dos frases relacionadas con esta página.",
      notes: [
        "Incluye un título y copy específicos de la página; el bloque también añade sus botones.",
      ],
    },
  },
  ProbarCta: {
    sections: ["guias"],
    kind: "container",
    props: z
      .object({
        vendor: z.string().min(1).optional(),
        noun: z.string().min(1).optional(),
      })
      .strict(),
    description:
      'Mid-article prompt to drop a bill, for the reader who has the document open. `vendor` names the issuer; `noun` is what that document is called ("boleta", "liquidación") and defaults to "factura".',
    authoring: {
      label: "Invitación a probar",
      group: "calls-to-action",
      rank: 10,
      childPlaceholder: "Texto breve para invitar a probar la app.",
    },
  },
  CtaButton: {
    sections: ["guias"],
    kind: "container",
    props: z
      .object({
        href: z
          .string()
          .min(1)
          // Content may link into this site or out of it, but a `javascript:`
          // or `data:` href is a script delivered through an attribute — the
          // one place a link is not just a link.
          .refine(
            (h) => /^(https?:\/\/|\/|#|mailto:)/.test(h),
            "must be a site path, an http(s) URL, an anchor or a mailto: link",
          ),
        variant: z.enum(["solid", "invert"]).optional(),
        newTab: z.boolean().optional(),
      })
      .strict(),
    description: "A single call-to-action button.",
    authoring: {
      label: "Botón CTA",
      group: "calls-to-action",
      rank: 20,
      propertyDescriptions: {
        href: "Ruta del sitio, URL https, ancla o enlace mailto.",
        variant: "Aspecto del botón.",
        newTab: "Abre el enlace en una pestaña nueva.",
      },
      propertyPlaceholders: { href: "/demo" },
      childPlaceholder: "Texto del botón",
    },
  },
  CtaRow: {
    sections: ["guias"],
    kind: "container",
    props: noProps,
    description: "Places a couple of CTA buttons side by side.",
    authoring: {
      label: "Fila de botones",
      group: "calls-to-action",
      rank: 30,
      childPlaceholder: "<DemoCta />\n\n<SignupCta />",
    },
  },
  DemoCta: {
    sections: ["guias"],
    kind: "container",
    props: noProps,
    description:
      'Button to the demo. Children replace the label ("Ver la demo").',
    authoring: {
      label: "Botón de demo",
      group: "calls-to-action",
      rank: 40,
      childPlaceholder: "Ver la demo",
    },
  },
  SignupCta: {
    sections: ["guias"],
    kind: "container",
    props: noProps,
    description: "Button to sign-up. Children replace the label.",
    authoring: {
      label: "Botón de registro",
      group: "calls-to-action",
      rank: 50,
      childPlaceholder: "Crear una cuenta",
    },
  },
  InflacionChart: {
    sections: ["guias"],
    kind: "leaf",
    props: z.object({ chart: chartIdSchema }).strict(),
    description:
      "A server-rendered SVG chart from the inflation dataset. `chart` picks which one; the ids are fixed by the data module.",
    authoring: {
      label: "Gráfico de inflación",
      group: "charts-summaries",
      rank: 10,
      propertyDescriptions: {
        chart: "Identificador de la serie que se quiere mostrar.",
      },
    },
  },
  TrustBlock: {
    sections: ["guias"],
    kind: "leaf",
    props: noProps,
    description:
      "The site's trust strip. Sizes itself off its container, so an article column gets the ledger-row form.",
    authoring: {
      label: "Franja de confianza",
      group: "article-structure",
      rank: 10,
      notes: ["Escribe el componente bare, sin propiedades."],
    },
  },
  Faq: {
    sections: ["guias", "noticias", "estadisticas", "investigaciones"],
    kind: "leaf",
    props: CONTEXT_BOUND,
    description:
      "Renders the questions from this page's `faq` metadata, and marks where they appear. Write a bare <Faq />; the questions themselves are metadata, not body.",
    authoring: {
      label: "Preguntas frecuentes",
      group: "article-structure",
      rank: 20,
      notes: [
        "Al insertarlo aparecen en la barra lateral los campos obligatorios de FAQ; las preguntas vienen de metadata, no de hijos ni propiedades.",
        "Escribe el componente bare, sin propiedades.",
      ],
    },
  },
  RelatedGuides: {
    sections: ["guias"],
    kind: "leaf",
    props: CONTEXT_BOUND,
    description:
      "The related-guides block. The page computes the list; write a bare <RelatedGuides /> where it should appear.",
    authoring: {
      label: "Guías relacionadas",
      group: "article-structure",
      rank: 40,
      notes: ["La página calcula la lista; no agregues propiedades."],
    },
  },
  // Shared statistics/research article furniture. The author writes bare tags;
  // the route binds the page-specific data from CMS JSONB.
  Fuentes: {
    // Not only a data-page block. A guide that walks through a real document
    // rests on the same kind of primary material a statistics page does — the
    // distributor's own "conocé tu factura", the ENARGAS resolution behind a
    // charge — and a reader who wants to check a claim deserves the link in the
    // article rather than nowhere. Noticias gets the tag for the same reason
    // and reads it from the same shared metadata key.
    sections: ["guias", "noticias", ...DATA_SECTIONS],
    kind: "leaf",
    props: CONTEXT_BOUND,
    description: "Renders this page's source metadata.",
    authoring: {
      label: "Fuentes",
      group: "article-structure",
      rank: 30,
      notes: [
        "Al insertarlo aparecen en la barra lateral los campos obligatorios de fuentes; el contenido viene de metadata.",
        "Escribe el componente bare, sin propiedades.",
      ],
    },
  },
  Subpaginas: {
    sections: DATA_SECTIONS,
    kind: "leaf",
    props: CONTEXT_BOUND,
    description: "Renders direct CMS children of this hub page.",
    authoring: {
      label: "Subpáginas",
      group: "article-structure",
      rank: 50,
      notes: ["La página calcula las hijas directas; no agregues propiedades."],
    },
  },
  PaginaRelacionada: {
    // Guides can point readers to a related statistics or research page too;
    // the href schema below keeps the card from becoming a generic escape hatch.
    sections: ["guias", ...DATA_SECTIONS],
    kind: "container",
    props: z
      .object({ href: z.string().regex(/^\/(estadisticas|investigaciones)\//) })
      .strict(),
    description: "A related statistics or research page card.",
    authoring: {
      label: "Página relacionada",
      group: "article-structure",
      rank: 70,
      propertyDescriptions: {
        href: "Ruta de una página de estadísticas o investigación.",
      },
      propertyPlaceholders: { href: "/estadisticas/ruta" },
      childPlaceholder: "Una frase que explique por qué seguir leyendo.",
      notes: ["La ruta debe comenzar con /estadisticas/ o /investigaciones/."],
    },
  },
  IpcViviendaChart: {
    sections: ["estadisticas"],
    kind: "leaf",
    props: z
      .object({
        region: z.enum([
          "nacional",
          "gba",
          "pampeana",
          "noreste",
          "noroeste",
          "cuyo",
          "patagonia",
        ]),
        variacion: z.enum(["mensual", "interanual"]),
      })
      .strict(),
    description: "IPC housing chart for one INDEC region and variation.",
    authoring: {
      label: "IPC de vivienda",
      group: "charts-summaries",
      rank: 20,
      propertyDescriptions: {
        region: "Región del INDEC que se quiere comparar.",
        variacion: "Período de variación que muestra el gráfico.",
      },
    },
  },
  ResumenRegion: {
    sections: ["estadisticas"],
    kind: "leaf",
    props: z
      .object({
        region: z.enum([
          "gba",
          "pampeana",
          "noreste",
          "noroeste",
          "cuyo",
          "patagonia",
        ]),
      })
      .strict(),
    description: "Current IPC summary for one INDEC region.",
    authoring: {
      label: "Resumen regional del IPC",
      group: "charts-summaries",
      rank: 30,
      propertyDescriptions: {
        region: "Región del INDEC que resume la tarjeta.",
      },
    },
  },
  ...DATA_LEAF_COMPONENTS,
} as const satisfies Record<string, ContentComponentDefinition>;

export type ContentComponentName = keyof typeof CONTENT_COMPONENT_DEFINITIONS;

export const CONTENT_COMPONENT_NAMES = Object.keys(
  CONTENT_COMPONENT_DEFINITIONS,
) as ContentComponentName[];

export function isContentComponentName(
  name: string,
): name is ContentComponentName {
  return Object.hasOwn(CONTENT_COMPONENT_DEFINITIONS, name);
}

export function componentDefinition(
  name: string,
): ContentComponentDefinition | undefined {
  return isContentComponentName(name)
    ? (CONTENT_COMPONENT_DEFINITIONS[name] as ContentComponentDefinition)
    : undefined;
}

/** The components a given section may use. */
export function componentsForSection(
  section: ContentSection,
): ContentComponentName[] {
  return CONTENT_COMPONENT_NAMES.filter((name) =>
    (
      CONTENT_COMPONENT_DEFINITIONS[name] as ContentComponentDefinition
    ).sections.includes(section),
  );
}

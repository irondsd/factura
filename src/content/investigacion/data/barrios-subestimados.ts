import {
  CRIME_YEAR,
  formatArs,
  formatArsPerMetre,
  formatRate,
  RENT_PERIOD_LABEL,
  rows,
  TEMPORAL_COVERAGE,
} from "./alquiler-seguridad";

// Four barrios that deliver more everyday utility than their usual place in
// the porteño prestige hierarchy suggests. This is deliberately not another
// all-48 ranking: price and recorded crime are measured for every candidate,
// while transport, public space and the future are editorial assessments that
// cannot honestly be made to look like one official index.
//
// Selection method
// ─────────────────
// 1. Start with the barrios for which IDECBA publishes a two-room asking rent,
//    so every recommendation can be compared on the same dwelling.
// 2. Keep places with a concrete advantage on at least two of these axes:
//    price, recorded crime, rapid-transit access, usable public space or a
//    funded/in-progress urban change.
// 3. Reject "cheap" on its own. A barrio only makes the page if the discount is
//    paired with a reason somebody would actively choose to live there.
// 4. Keep four different trade-offs instead of averaging them into a universal
//    winner. `preferenceScore()` exists only for the reader-controlled sorter;
//    its editorial inputs and weights are printed beside the control.
//
// Transport scores describe network usefulness, not a count of stops: direct
// rail modes, interchange and useful bus corridors matter more than several
// stops of the same line. Public-space scores describe access to a meaningful
// plaza or park inside/at the edge of the barrio, not tree canopy. Future
// scores count work in progress or a live procurement more heavily than plans.

export { CRIME_YEAR, RENT_PERIOD_LABEL, TEMPORAL_COVERAGE };
export { formatArs, formatArsPerMetre, formatRate };

export const SOURCE_VINTAGE = `alquiler del ${RENT_PERIOD_LABEL}, delitos de ${CRIME_YEAR}`;

export type BarrioId =
  | "balvanera"
  | "boedo"
  | "villa-gral-mitre"
  | "villa-del-parque";

type EditorialProfile = {
  id: BarrioId;
  label: string;
  promise: string;
  transport: number;
  publicSpace: number;
  future: number;
  transportLabel: string;
  publicSpaceLabel: string;
  futureLabel: string;
  bestFor: string;
  upside: string;
  tradeoff: string;
  outlook: string;
};

const EDITORIAL: EditorialProfile[] = [
  {
    id: "balvanera",
    label: "Balvanera",
    promise: "La centralidad que el mercado todavía descuenta",
    transport: 100,
    publicSpace: 30,
    future: 72,
    transportLabel: "A, B y H + Sarmiento + gran red de colectivos",
    publicSpaceLabel: "Déficit fuerte, amortiguado por Manzana 66 y Parque de la Estación",
    futureLabel: "Once ordenado desde 2024; Línea F en licitación, con plazo incierto",
    bestFor: "Quien quiere resolver casi toda la ciudad sin auto",
    upside:
      "El alquiler de los cuatro más bajo después de Villa General Mitre y una conectividad difícil de igualar: tres líneas de subte, tren y corredores de colectivos caminables.",
    tradeoff:
      "Tiene poco verde, mucho ruido y una tasa de delitos registrados por encima de la Ciudad. La población diurna de Once infla parte de esa tasa, pero no elimina el problema.",
    outlook:
      "La liberación y el control sostenido de las veredas de Once ya cambiaron la experiencia peatonal. La futura Línea F reforzaría todavía más el nodo, pero una licitación no es una estación abierta y no se puntúa como certeza.",
  },
  {
    id: "boedo",
    label: "Boedo",
    promise: "El equilibrio que no cobra precio de barrio de moda",
    transport: 78,
    publicSpace: 42,
    future: 92,
    transportLabel: "Línea E + corredores de San Juan, Boedo y La Plata",
    publicSpaceLabel: "Plazas barriales, pero sin un gran parque propio",
    futureLabel: "TramBus T1 en obra sobre avenida La Plata",
    bestFor: "Quien busca centralidad razonable sin el pulso de Once",
    upside:
      "Queda exactamente bien parado en las dos métricas duras: más barato que dos tercios de los barrios comparables y más tranquilo que otros dos tercios.",
    tradeoff:
      "La Línea E es útil, pero menos frecuente y menos directa hacia el norte que otras líneas; el barrio tampoco resuelve la falta de un parque grande.",
    outlook:
      "El TramBus T1 es el cambio futuro más firme de esta selección: sus paradores ya están en ejecución y convertirán avenida La Plata en un eje de combinación norte-sur.",
  },
  {
    id: "villa-gral-mitre",
    label: "Villa General Mitre",
    promise: "El descuento más difícil de explicar por los datos",
    transport: 62,
    publicSpace: 68,
    future: 46,
    transportLabel: "Metrobus San Martín + borde del Metrobus Juan B. Justo",
    publicSpaceLabel: "Plaza Roque Sáenz Peña y tejido residencial más calmo",
    futureLabel: "Mejoras incrementales; sin salto de red confirmado",
    bestFor: "Quien trabaja híbrido y quiere barrio antes que centralidad",
    upside:
      "Es el más barato de los cuatro por m² y registra menos delitos que la Ciudad. En el estudio previo fue el mejor cruce de precio y seguridad de todos los barrios con dato.",
    tradeoff:
      "No tiene subte ni tren dentro del barrio. El Metrobus mejora el colectivo, pero un viaje con combinación sigue siendo un viaje con combinación.",
    outlook:
      "Su oportunidad es también su límite: no depende de una megaobra que ya esté capitalizada en el precio. Las mejoras previstas son de corredor y espacio público, no un cambio estructural de acceso.",
  },
  {
    id: "villa-del-parque",
    label: "Villa del Parque",
    promise: "Calma casi de zona norte a precio de oeste",
    transport: 66,
    publicSpace: 80,
    future: 44,
    transportLabel: "Ferrocarril San Martín + Metrobus San Martín + colectivos",
    publicSpaceLabel: "Parque Aristóbulo del Valle y cercanía de Agronomía",
    futureLabel: "Sin gran obra confirmada: el valor está en lo que ya existe",
    bestFor: "Quien prioriza calma, verde y vida de cercanía",
    upside:
      "Es el más tranquilo de los 31 barrios comparables y su alquiler por m² sigue apenas por encima de Boedo, muy lejos de los valores del corredor norte.",
    tradeoff:
      "Para destinos fuera del eje del San Martín depende bastante del colectivo. La distancia al centro se siente más de noche y los fines de semana.",
    outlook:
      "No hay que venderle una transformación imaginaria: su tesis es conservar una vida cotidiana ya buena. La presión de nuevos edificios puede sumar oferta, pero también erosionar ese carácter.",
  },
];

const measured = new Map(rows("barrios").map((row) => [row.id, row]));

export type Candidate = EditorialProfile & {
  rentMonthly: number;
  rentPerMetre: number;
  crimeRate: number;
  crimeRatio: number;
  cheap: number;
  safe: number;
};

export const CANDIDATES: Candidate[] = EDITORIAL.map((profile) => {
  const row = measured.get(profile.id);
  if (
    !row ||
    row.rentMonthly === null ||
    row.rentPerMetre === null ||
    row.cheap === null ||
    row.safe === null
  ) {
    throw new Error(`No comparable rent/safety row for ${profile.id}`);
  }
  return {
    ...profile,
    rentMonthly: row.rentMonthly,
    rentPerMetre: row.rentPerMetre,
    crimeRate: row.crimeRate,
    crimeRatio: row.crimeRatio,
    cheap: row.cheap,
    safe: row.safe,
  };
});

export const PREFERENCES = [
  {
    id: "equilibrio",
    label: "Equilibrio",
    weights: { cheap: 25, safe: 25, transport: 25, publicSpace: 15, future: 10 },
  },
  {
    id: "movilidad",
    label: "Moverme fácil",
    weights: { cheap: 15, safe: 15, transport: 45, publicSpace: 10, future: 15 },
  },
  {
    id: "calma",
    label: "Calma",
    weights: { cheap: 15, safe: 45, transport: 15, publicSpace: 20, future: 5 },
  },
  {
    id: "verde",
    label: "Verde y barrio",
    weights: { cheap: 15, safe: 20, transport: 15, publicSpace: 40, future: 10 },
  },
] as const;

export type PreferenceId = (typeof PREFERENCES)[number]["id"];

export function preferenceScore(candidate: Candidate, id: PreferenceId): number {
  const { weights } = PREFERENCES.find((preference) => preference.id === id)!;
  return (
    (candidate.cheap * weights.cheap +
      candidate.safe * weights.safe +
      candidate.transport * weights.transport +
      candidate.publicSpace * weights.publicSpace +
      candidate.future * weights.future) /
    100
  );
}

export const PRICE_SAFETY_COVERAGE = rows("barrios").filter(
  (row) => row.rentPerMetre !== null,
).length;


// Dated snapshot of the public summary published by InvertirNeuquén in June
// 2026. The citywide statistic and the neighbourhood estimates are deliberately
// kept separate: the source reports the former as a market median and the
// latter as parcel estimates aggregated by barrio.

export const SOURCE_URL = "https://www.invertirneuquen.com.ar/";
export const NEIGHBORHOOD_SOURCE_URL =
  "https://www.invertirneuquen.com.ar/barrios/";
export const METHODOLOGY_URL =
  "https://www.invertirneuquen.com.ar/metodologia.html";
export const LEGAL_URL = "https://www.invertirneuquen.com.ar/aviso-legal.html";
export const CATASTRO_URL = "https://dpc.neuquen.gob.ar/Home/SistemaITC";

export const AS_OF = "junio de 2026";
export const SCOPE =
  "Neuquén Capital · ejido municipal 2022 (Ley Provincial N.º 3332)";
export const CITYWIDE_MEDIAN_USD_M2 = 186;
export const LOT_SAMPLE_COUNT = 167;
export const LISTING_COUNT = 1_881;
export const PARCEL_COUNT = 63_762;

export type Neighborhood = {
  id: string;
  label: string;
  usdM2: number;
};

/**
 * Values transcribed from the source's public barrio summary. These are not a
 * second calculation of the citywide median and do not carry a per-barrio lot
 * sample count: the source's methodology uses the 167 lot observations to
 * interpolate parcel values spatially.
 */
export const NEIGHBORHOODS: readonly Neighborhood[] = [
  { id: "santa-genoveva", label: "Santa Genoveva", usdM2: 756 },
  { id: "area-centro-oeste", label: "Área Centro Oeste", usdM2: 692 },
  { id: "provincias-unidas", label: "Provincias Unidas", usdM2: 674 },
  { id: "area-centro-este", label: "Área Centro Este", usdM2: 671 },
  { id: "alta-barda", label: "Alta Barda", usdM2: 649 },
  { id: "area-centro-sur", label: "Área Centro Sur", usdM2: 639 },
  { id: "nuevo", label: "Nuevo", usdM2: 630 },
  { id: "villa-farrel", label: "Villa Farrel", usdM2: 589 },
  { id: "villa-florencia", label: "Villa Florencia", usdM2: 578 },
  { id: "bouquet-roldan", label: "Bouquet Roldán", usdM2: 576 },
  { id: "limay", label: "Limay", usdM2: 548 },
  { id: "don-bosco-ii", label: "Don Bosco II", usdM2: 488 },
  { id: "islas-malvinas", label: "Islas Malvinas", usdM2: 456 },
  { id: "rio-grande", label: "Río Grande", usdM2: 454 },
  { id: "la-sirena", label: "La Sirena", usdM2: 416 },
  { id: "sapere", label: "Sapere", usdM2: 411 },
  { id: "cumelen", label: "Cumelén", usdM2: 399 },
  { id: "villa-maria", label: "Villa María", usdM2: 396 },
  { id: "mariano-moreno", label: "Mariano Moreno", usdM2: 386 },
  { id: "don-bosco-iii", label: "Don Bosco III", usdM2: 371 },
  { id: "huilliches", label: "Huilliches", usdM2: 366 },
  { id: "14-de-octubre-copol", label: "14 de Octubre COPOL", usdM2: 362 },
  { id: "belgrano", label: "Belgrano", usdM2: 336 },
  { id: "rincon-de-emilio", label: "Rincón de Emilio", usdM2: 314 },
  { id: "bardas-soleadas", label: "Bardas Soleadas", usdM2: 313 },
  { id: "union-de-mayo", label: "Unión de Mayo", usdM2: 312 },
  { id: "militar", label: "Militar", usdM2: 288 },
  { id: "gregorio-alvarez", label: "Gregorio Álvarez", usdM2: 275 },
  { id: "melipal", label: "Melipal", usdM2: 274 },
  { id: "villa-ceferino", label: "Villa Ceferino", usdM2: 272 },
  { id: "el-progreso", label: "El Progreso", usdM2: 244 },
  { id: "canal-v", label: "Canal V", usdM2: 237 },
  { id: "altos-del-limay", label: "Altos del Limay", usdM2: 234 },
  {
    id: "terrazas-del-neuquen",
    label: "Terrazas del Neuquén",
    usdM2: 211,
  },
  { id: "san-lorenzo-sur", label: "San Lorenzo Sur", usdM2: 203 },
  { id: "san-lorenzo-norte", label: "San Lorenzo Norte", usdM2: 192 },
  { id: "valentina-sur-urbana", label: "Valentina Sur Urbana", usdM2: 190 },
  { id: "gran-neuquen-sur", label: "Gran Neuquén Sur", usdM2: 188 },
  { id: "gran-neuquen-norte", label: "Gran Neuquén Norte", usdM2: 182 },
  { id: "ciudad-industrial", label: "Ciudad Industrial", usdM2: 165 },
  { id: "confluencia-urbano", label: "Confluencia Urbano", usdM2: 144 },
  { id: "valentina-sur-rural", label: "Valentina Sur Rural", usdM2: 141 },
  { id: "confluencia-rural", label: "Confluencia Rural", usdM2: 133 },
  {
    id: "valentina-norte-urbana",
    label: "Valentina Norte Urbana",
    usdM2: 120,
  },
  { id: "hibepa", label: "Hibepa", usdM2: 118 },
  { id: "cuenca-xv", label: "Cuenca XV", usdM2: 117 },
  { id: "valentina-norte-rural", label: "Valentina Norte Rural", usdM2: 96 },
  { id: "esfuerzo", label: "Esfuerzo", usdM2: 96 },
  {
    id: "colonia-nueva-esperanza",
    label: "Colonia Nueva Esperanza",
    usdM2: 41,
  },
] as const;

export const NEIGHBORHOOD_MIN_USD_M2 = Math.min(
  ...NEIGHBORHOODS.map((row) => row.usdM2),
);
export const NEIGHBORHOOD_MAX_USD_M2 = Math.max(
  ...NEIGHBORHOODS.map((row) => row.usdM2),
);

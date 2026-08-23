/**
 * Snapshot of the 2025 Estudio de Valores de la Tierra Urbana de Córdoba.
 *
 * The source table is reproduced in the Catastro resolution's technical report
 * on printed pages 50–51. The report publishes the medians in pesos and uses
 * the official Banco Nación exchange rate from 15 October 2025 to express the
 * same values in dollars. Keeping that convention here makes the conversion
 * explicit and keeps the article copy out of sync-proof calculations.
 */

export const SOURCE = "IDECOR / Dirección General de Catastro de Córdoba";
export const SOURCE_URL =
  "https://www.catastrocordoba.gob.ar/wp-content/uploads/2026/01/resolucion_23_2025_actualizacion_de_valores_de_la_tierra_2.pdf";
export const MAP_URL = "https://www.mapascordoba.gob.ar/#/mapas";
export const IDECOR_2024_URL =
  "https://www.idecor.gob.ar/suelo-urbano-consulta-el-mapa-con-los-valores-georreferenciados-de-2024/";
export const IDECOR_2024_REPORT_URL =
  "https://obs-idecor-mapas-docs.obs.sa-argentina-1.myhuaweicloud.com/m548/Informe_Valores_Tierra_Urbana_2024.pdf";

export const VINTAGE = "2025";
export const REPORT_PAGE = "50–51";
export const EXCHANGE_RATE = 1373.5;
export const EXCHANGE_RATE_DATE = "15/10/2025";
export const EXCHANGE_RATE_NOTE =
  "cotización oficial del Banco Nación al 15/10/2025";

export const COVERAGE = {
  provinceParcels: 1_748_904,
  cityParcels: 368_269,
  localities: 427,
  sourceRecordCount: ">1,7 millones de parcelas urbanas",
} as const;

/** IDECOR's published provincial median for the 2024 edition. */
export const PROVINCIAL_MEDIAN_2024_USD_M2 = 32;

export type SoilCluster = {
  id: string;
  label: string;
  group: "capital" | "gran-cordoba" | "provincia";
  parcelCount: number;
  arsM2: number;
};

/** Table N°XX in the 2025 technical report. */
export const CLUSTERS: readonly SoilCluster[] = [
  {
    id: "cordoba-capital",
    label: "Córdoba Capital",
    group: "capital",
    parcelCount: 368_269,
    arsM2: 137_350,
  },
  {
    id: "gran-cordoba-oeste-noroeste",
    label: "Gran Córdoba (Oeste-Noroeste)",
    group: "gran-cordoba",
    parcelCount: 110_504,
    arsM2: 35_711,
  },
  {
    id: "gran-cordoba-sur-noreste",
    label: "Gran Córdoba (Sur-Noreste)",
    group: "gran-cordoba",
    parcelCount: 38_173,
    arsM2: 19_229,
  },
  {
    id: "grandes-ciudades",
    label: "Grandes ciudades",
    group: "provincia",
    parcelCount: 159_085,
    arsM2: 96_145,
  },
  {
    id: "localidades-pampeanas-pequenas",
    label: "Localidades Pampeanas Pequeñas",
    group: "provincia",
    parcelCount: 194_533,
    arsM2: 24_723,
  },
  {
    id: "localidades-serranas",
    label: "Localidades Serranas",
    group: "provincia",
    parcelCount: 225_034,
    arsM2: 16_482,
  },
  {
    id: "localidades-pampeanas-medianas",
    label: "Localidades Pampeanas Medianas",
    group: "provincia",
    parcelCount: 243_022,
    arsM2: 63_181,
  },
  {
    id: "centralidades-economicas-pampeanas",
    label: "Centralidades Económicas Pampeanas",
    group: "provincia",
    parcelCount: 117_776,
    arsM2: 68_675,
  },
  {
    id: "localidades-arco-noroeste",
    label: "Localidades Arco Noroeste",
    group: "provincia",
    parcelCount: 29_487,
    arsM2: 10_988,
  },
  {
    id: "localidades-serranas-turisticas",
    label: "Localidades Serranas Turísticas",
    group: "provincia",
    parcelCount: 220_990,
    arsM2: 24_723,
  },
  {
    id: "centralidades-economicas-noroeste",
    label: "Centralidades Económicas Noroeste",
    group: "provincia",
    parcelCount: 42_031,
    arsM2: 32_964,
  },
] as const;

const ARS = new Intl.NumberFormat("es-AR", {
  maximumFractionDigits: 0,
});
const USD = new Intl.NumberFormat("es-AR", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});
const PARCELS = new Intl.NumberFormat("es-AR", {
  maximumFractionDigits: 0,
});

/** The report's dollar value, rounded to the same whole-dollar display. */
export function usdM2(arsM2: number): number {
  return Math.round(arsM2 / EXCHANGE_RATE);
}

export function formatArs(value: number): string {
  return `ARS ${ARS.format(value)}`;
}

export function formatUsd(value: number): string {
  return `US$ ${USD.format(value)}`;
}

export function formatParcels(value: number): string {
  return PARCELS.format(value);
}

export function clustersByGroup(group: SoilCluster["group"]): SoilCluster[] {
  return CLUSTERS.filter((cluster) => cluster.group === group);
}

export const CITY = CLUSTERS[0];

if (
  CLUSTERS.reduce((sum, cluster) => sum + cluster.parcelCount, 0) !==
  COVERAGE.provinceParcels
) {
  throw new Error("suelo-cordoba: the cluster parcel counts no longer add up");
}

if (usdM2(CITY.arsM2) !== 100) {
  throw new Error(
    "suelo-cordoba: Córdoba Capital should convert to US$ 100/m²",
  );
}

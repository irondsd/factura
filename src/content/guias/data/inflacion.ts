// Reference data behind the `inflacion` guides and every <InflacionChart /> they
// render. Editorial data, not product data: it never touches a user's bills, and
// it's baked into the static build like the prose around it.
//
// ── What the numbers are ────────────────────────────────────────────────────
// Monthly INDEC IPC index levels for **GBA** (the region CABA and the AMBA belong
// to — the audience of nearly every guide on the site), rebased so that
// **November 2023 = 100**. November is the last month before the December 2023
// devaluation and the tariff correction that followed, so "how many times more
// expensive is this than before all of it" is exactly `value / 100`.
//
// Alongside them, the monthly average of the dólar blue (venta), which is the
// same rate the app converts bills with — so a chart here and the USD line on
// /app/insights are measuring with the same ruler.
//
// ── Refreshing ──────────────────────────────────────────────────────────────
// INDEC publishes the IPC around the 13th of the following month. To extend the
// series, append one entry to `MONTHS` and one number to each series, in order:
//
//   IPC   https://www.indec.gob.ar/ftp/cuadros/economia/serie_ipc_aperturas.csv
//         (columns: Codigo;Descripcion_aperturas;Clasificador;Periodo;Indice_IPC;…;Region)
//         Take Region=GBA and divide the new month's `Indice_IPC` by the same
//         series' November 2023 level (`Periodo` 202311), ×100. The COICOP codes
//         each series uses are named in the comments below.
//   Blue  https://api.argentinadatos.com/v1/cotizaciones/dolares/blue
//         Mean of every `venta` in the month.
//
// Then re-read the guides: several quote a figure from the last point in prose
// ("×9,2", "47,8%"), and a stale sentence next to a fresh chart is worse than
// both being a month old. `LAST_UPDATED` is what the charts print as their
// footnote, so bump it too.

/** Last month present in every series, as a human label for chart footnotes. */
export const LAST_UPDATED = "junio de 2026";

/** Every chart id a guide may pass to `<InflacionChart chart="…" />`.
 *
 * The chart *specs* live in `components/guides/InflacionChart.tsx` — this is
 * only the list of names, kept here because `scripts/validate-guides.ts` checks
 * guide bodies against it and so has to import it without pulling in React.
 * Same split as `categories.ts`, for the same reason: a mistyped id would
 * otherwise get past the validator and break the build. Adding a chart means
 * adding the id here and the spec there; `satisfies Record<ChartId, Chart>`
 * makes the compiler insist on both. */
export const CHART_IDS = [
  "servicios-vs-general",
  "cuanto-subio-cada-servicio",
  "pesos-vs-dolares",
  "luz-y-gas",
  "expensas",
  "agua-y-vivienda",
  "internet-y-celular",
] as const;

export type ChartId = (typeof CHART_IDS)[number];

export function isChartId(value: string): value is ChartId {
  return (CHART_IDS as readonly string[]).includes(value);
}

/** `YYYYMM` for each point, oldest first. Nov-2023 is the base month (=100). */
export const MONTHS = [
  "202311",
  "202312",
  "202401",
  "202402",
  "202403",
  "202404",
  "202405",
  "202406",
  "202407",
  "202408",
  "202409",
  "202410",
  "202411",
  "202412",
  "202501",
  "202502",
  "202503",
  "202504",
  "202505",
  "202506",
  "202507",
  "202508",
  "202509",
  "202510",
  "202511",
  "202512",
  "202601",
  "202602",
  "202603",
  "202604",
  "202605",
  "202606",
] as const;

/** IPC nivel general — "la inflación" as it's reported every month. COICOP `0`. */
const general = [
  100, 125.1, 149.5, 171.9, 191.7, 209.4, 218.4, 227.9, 237.1, 246.9, 256.1,
  263.3, 270.1, 277.9, 283.5, 289.8, 301, 309.3, 313.9, 320.3, 326.3, 332.4,
  339.4, 347.5, 356.1, 366.1, 376.2, 386, 399.2, 410.2, 419.6, 427.4,
];

/** Division 04, "Vivienda, agua, electricidad, gas y otros combustibles" — the
 * whole cost of keeping a home running, and the fastest-rising division of the
 * index since 2023. */
const vivienda = [
  100, 114.5, 125.2, 153.9, 175.3, 246.1, 251.2, 280.7, 294.6, 312.6, 334.1,
  349.7, 365.4, 385.6, 394.1, 406.5, 418.9, 426.1, 438.5, 457.2, 458.9, 469.2,
  482.5, 493.5, 509.6, 528.9, 539.9, 572.1, 592.5, 620, 630.9, 655.3,
];

/** COICOP `04.5`, "Electricidad, gas y otros combustibles" — the energy bills. */
const energia = [
  100, 101.1, 113.2, 167.3, 223.6, 365.7, 363.7, 440.2, 440.4, 457.8, 486.2,
  499.3, 516.5, 536, 551.6, 566.9, 574.4, 577.1, 588, 597.7, 606.8, 619.9, 639,
  649.1, 676.6, 698.5, 712.6, 798.7, 836.3, 902.8, 910.5, 920.8,
];

/** COICOP `04.1`, "Alquiler de la vivienda y gastos conexos" — the heading the
 * IPC files **expensas** under, together with rent. INDEC named expensas
 * explicitly as a driver of the GBA figure in its June 2026 report. */
const expensas = [
  100, 115.8, 121.7, 146.1, 154.5, 176.5, 188, 204.8, 229.9, 253.1, 277.5,
  298.2, 317.9, 347.4, 354.1, 371.8, 392.4, 402.6, 423.8, 454.7, 451, 463.6,
  477.6, 491.5, 504.1, 533.6, 540.3, 553.4, 570.6, 583.9, 598.3, 640.1,
];

/** COICOP `08.3`, "Servicios de telefonía e internet". */
const telecom = [
  100, 114.4, 142.6, 180.7, 210.7, 242.2, 264.1, 278.9, 288.7, 301.5, 311.3,
  318.9, 322.9, 340.7, 348.7, 357.1, 368.7, 376.9, 394, 402.7, 412.9, 421.1,
  430.4, 440.9, 453.5, 470.2, 487.8, 497.9, 512.9, 534.1, 554.5, 554.8,
];

/** COICOP `07.3`, "Transporte público" — not a bill Factura reads, but the other
 * regulated price a household feels monthly, and a useful yardstick. */
const transporte = [
  100, 112.1, 141.8, 264.5, 291.7, 285.8, 309.2, 318.7, 317.1, 374, 403.8,
  412.8, 444.7, 457.7, 458.9, 458.5, 468.2, 475.9, 482.9, 500.4, 524.5, 531.7,
  541.8, 553.2, 562.7, 601.3, 606.9, 632.7, 687.1, 693, 717.7, 748.9,
];

/** Monthly average of the dólar blue (venta), in pesos. Not an index — the
 * actual rate, so `SERIES.blue` doubles as the deflator for USD lenses. */
const blue = [
  956, 989, 1150, 1118, 1018, 1018, 1125, 1293, 1437, 1355, 1263, 1207, 1140,
  1138, 1226, 1222, 1257, 1274, 1173, 1192, 1293, 1333, 1426, 1474, 1434, 1478,
  1502, 1438, 1420, 1408, 1417, 1473,
];

export const SERIES = {
  general,
  vivienda,
  energia,
  expensas,
  telecom,
  transporte,
  blue,
} as const;

export type SeriesId = Exclude<keyof typeof SERIES, "blue">;

/** Display label for each series, as it appears in chart legends. */
export const SERIES_LABEL: Record<SeriesId, string> = {
  general: "Inflación general (IPC)",
  vivienda: "Vivienda y servicios",
  energia: "Luz y gas",
  expensas: "Expensas y alquiler",
  telecom: "Internet y telefonía",
  transporte: "Transporte público",
};

/** How many times the price multiplied between the base month and the last
 * point — the number the guides quote as "×9,2". */
export function multiple(id: SeriesId): number {
  const s = SERIES[id];
  return s[s.length - 1] / s[0];
}

/** The same series measured in dollars: pesos deflated by the blue rate, rebased
 * so the base month is 100 again.
 *
 * This is the whole argument of the section in one function. A peso line answers
 * "how much bigger is the number on the bill"; this one answers "how much more
 * of everything else does that bill cost me", and the gap between the two is the
 * currency losing value rather than the service getting dearer. It's also the
 * exact calculation behind the app's inflation lens, so a reader who signs up
 * sees their own bills drawn the way these charts are drawn. */
export function inUsd(id: SeriesId): number[] {
  const s = SERIES[id];
  return s.map((v, i) => (v / blue[i]) * (blue[0] / s[0]) * 100);
}

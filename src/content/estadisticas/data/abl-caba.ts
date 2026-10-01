import { BARRIOS } from "@/content/shared/caba";

// What the Ciudad de Buenos Aires charges a property in 2026, as the law writes
// it: the Impuesto Inmobiliario and the Tasa Retributiva por los Servicios de
// Alumbrado, Barrido y Limpieza (the ABL proper), which AGIP bills together on
// one monthly boleta.
//
// It backs /estadisticas/coeficiente-abl-por-barrio-caba. Like `absa-tarifas`,
// it is not a measurement: every number below is one the Legislatura chose and
// published in the Ley Impositiva, and it changes on 1 January and on no other
// day.
//
// ── Where each number comes from ──────────────────────────────────────────
// Ley 6.927 (Ley Impositiva 2026), Anexo, Título I, articles 41 to 45,
// published in the Boletín Oficial on 19 December 2025. AGIP later republished
// the annex over an "error material"; the corrected copy was diffed against the
// original for this module and articles 41–45 are identical in both, number
// for number.
//
//   • art. 41 — the Impuesto Inmobiliario: a marginal scale over the VFH,
//     `II = CF + (VFH − lm) × al × USC`, ten segments A–J (`ESCALA`).
//   • art. 42 — the tasa: `TRS = VFH × ab × [1 + (CG × pCG)] × USC`, with the
//     alícuota base, the ponderación and the table of coeficientes geográficos
//     by barrio and subzona (`TASA`, `COEFICIENTES`).
//   • art. 43 — the USC, fixed at 1, so it multiplies nothing this year.
//   • art. 44 — the monthly bonificación that caps each cuota at the previous
//     one plus the IPCBA of five months earlier, the 1 % surcharge on the tasa
//     above a VFH threshold, and the per-partida minimum (`ADICIONAL`,
//     `MINIMO`). The cap is *not* modelled — see `calcular`.
//   • art. 45 — the whole year may not exceed 1 % of market value. Not
//     modelled either: the market value is the one input nobody has.
//
// ── The coefficient is a subzona's, not a barrio's ────────────────────────
// Nineteen of the 48 barrios are cut into subzonas along avenues, and a
// barrio can span two of the law's three zones — Belgrano, Núñez, Palermo,
// Recoleta and Flores all do. So the unit of the table is the subzona, and a
// barrio has a *range*. The map shows either end of it; the calculator asks
// which side of the avenue the property is on. The law settles a partida that
// straddles a boundary: it takes the higher coefficient.
//
// The boundary text is transcribed as the law prints it, abbreviations and
// all, because it is the only definition there is. The law has no map of the
// subzonas, and drawing one would be our invention presented as the city's.
//
// ── Refreshing ────────────────────────────────────────────────────────────
// Once a year, when the Legislatura passes the next Ley Impositiva (usually in
// the last week of November, published mid-December):
//
//   1. Download the Anexo from the Boletín Oficial and find the articles
//      titled "Impuesto Inmobiliario y Tasa Retributiva…". Their numbers move
//      from year to year; the headings do not.
//   2. Replace `ESCALA`, `TASA`, `ADICIONAL`, `MINIMO` and `COEFICIENTES`, and
//      update `LEY`. The test fails if the scale's fixed quotas stop being the
//      running sum of the segments beneath them, which is the transcription
//      error that is easiest to make and hardest to see.
//   3. Check for a fe de erratas before trusting the first copy.

/** The law this module transcribes. */
export const LEY = {
  number: "6.927",
  year: 2026,
  title: "Ley Impositiva 2026",
  published: "2025-12-19",
  articles: "41 a 45",
  href: "https://documentosboletinoficial.buenosaires.gob.ar/publico/PL-LEY-LCABA-LCBA-6927-25-ANX.pdf",
} as const;

export const SOURCE = `Ley ${LEY.number} (${LEY.title}), Anexo, arts. ${LEY.articles}`;

/** One segment of the Impuesto Inmobiliario scale (art. 41). */
export type Segmento = {
  id: string;
  /** Lower bound of the VFH, in pesos — `lm` in the law's formula. */
  from: number;
  /** Upper bound, or `null` for the open top segment. */
  to: number | null;
  /** Cuota fija, in pesos: the tax owed on everything below `from`. */
  fixed: number;
  /** Alícuota on the excess over `from`, as a fraction (0,60 % → 0.006). */
  rate: number;
};

export const ESCALA: readonly Segmento[] = [
  { id: "A", from: 0, to: 19_150_000, fixed: 0, rate: 0.006 },
  { id: "B", from: 19_150_000, to: 28_100_000, fixed: 114_900, rate: 0.0065 },
  { id: "C", from: 28_100_000, to: 40_000_000, fixed: 173_075, rate: 0.007 },
  { id: "D", from: 40_000_000, to: 58_000_000, fixed: 256_375, rate: 0.0075 },
  { id: "E", from: 58_000_000, to: 87_000_000, fixed: 391_375, rate: 0.008 },
  { id: "F", from: 87_000_000, to: 140_000_000, fixed: 623_375, rate: 0.0085 },
  {
    id: "G",
    from: 140_000_000,
    to: 270_000_000,
    fixed: 1_073_875,
    rate: 0.009,
  },
  { id: "H", from: 270_000_000, to: 900_000_000, fixed: 2_243_875, rate: 0.01 },
  {
    id: "I",
    from: 900_000_000,
    to: 5_500_000_000,
    fixed: 8_543_875,
    rate: 0.011,
  },
  { id: "J", from: 5_500_000_000, to: null, fixed: 59_143_875, rate: 0.012 },
];

/** The tasa's parameters (arts. 42 and 43). */
export const TASA = {
  /** `ab`, the alícuota base, as a fraction of the VFH. */
  base: 0.008,
  /** `pCG`, how much of the coefficient reaches the bill. */
  weight: 0.5,
  /** `USC`, the Unidad de Sustentabilidad Contributiva. */
  usc: 1,
} as const;

/** The surcharge on the tasa above a VFH threshold (art. 44, second
 * paragraph): each cuota's tasa plus 1 % of itself. */
export const ADICIONAL = { threshold: 32_000_000, rate: 0.01 } as const;

/** The per-partida floor on the year's determined tax (art. 44). The law
 * splits it "en partes iguales" between the two tributes, which this module
 * reads as a floor of half on each. Cocheras, bauleras and other
 * complementary units have the lower one. */
export const MINIMO = { general: 14_100, complementaria: 4_850 } as const;

export type ZonaFiscal = "I" | "II" | "III";
export type BarrioId = (typeof BARRIOS)[number]["id"];

/** One row of the art. 42 table. */
export type Subzona = {
  barrio: BarrioId;
  zona: ZonaFiscal;
  /** The boundary as the law writes it, or `null` where the coefficient
   * covers the whole barrio. */
  tramo: string | null;
  /** The coeficiente geográfico, `CG`. */
  cg: number;
};

/** The art. 42 table, in the law's order: zona I, II, III, alphabetical
 * within each. */
export const COEFICIENTES: readonly Subzona[] = [
  // ── Zona I ──
  {
    barrio: "barracas",
    zona: "I",
    tramo:
      "Entre límite norte y Lafayette - Av. Suárez - Av. Vélez Sarsfield - Av. Australia - Benito Quinquela Martín - Herrera - Benito Quinquela Martín (norte) - General Hornos - Benito Quinquela Martín",
    cg: 0.25,
  },
  {
    barrio: "barracas",
    zona: "I",
    tramo:
      "Entre Lafayette - Av. Suárez - Av. Vélez Sarsfield - Av. Australia - Benito Quinquela Martín - Herrera - Benito Quinquela Martín (norte) - General Hornos - Benito Quinquela Martín y límite sur",
    cg: 0,
  },
  {
    barrio: "la-boca",
    zona: "I",
    tramo: "Entre límite norte y Benito Quinquela Martín",
    cg: 0.25,
  },
  {
    barrio: "la-boca",
    zona: "I",
    tramo: "Entre Benito Quinquela Martín y límite sur",
    cg: 0,
  },
  {
    barrio: "boedo",
    zona: "I",
    tramo: "Entre límite norte y Av. Juan de Garay",
    cg: 0.5,
  },
  {
    barrio: "boedo",
    zona: "I",
    tramo: "Entre Av. Juan de Garay y límite sur",
    cg: 0.25,
  },
  { barrio: "constitucion", zona: "I", tramo: null, cg: 0.5 },
  {
    barrio: "flores",
    zona: "I",
    tramo:
      "Entre Av. Directorio y Av. Asamblea - Av. Varela - Crisóstomo Álvarez - Av. Perito Moreno",
    cg: 0.5,
  },
  {
    barrio: "flores",
    zona: "I",
    tramo:
      "Entre Av. Asamblea - Av. Varela - Crisóstomo Álvarez - Av. Perito Moreno y límite sur",
    cg: 0.25,
  },
  { barrio: "liniers", zona: "I", tramo: null, cg: 0.5 },
  {
    barrio: "mataderos",
    zona: "I",
    tramo:
      "Entre Av. Emilio Castro, Av. Gral. Paz, Severo García Grande de Zequeira y Carhué",
    cg: 0.5,
  },
  {
    barrio: "mataderos",
    zona: "I",
    tramo:
      "Límites barriales excluida zona entre Av. Emilio Castro, Av. Gral. Paz, Severo García Grande de Zequeira y Carhué",
    cg: 0.25,
  },
  {
    barrio: "nueva-pompeya",
    zona: "I",
    tramo:
      "Entre límite norte y Av. Intendente Francisco Rabanal - Beazley - Av. Amancio Alcorta",
    cg: 0.25,
  },
  {
    barrio: "nueva-pompeya",
    zona: "I",
    tramo:
      "Entre Av. Intendente Francisco Rabanal - Beazley - Av. Amancio Alcorta y límite sur",
    cg: 0,
  },
  { barrio: "parque-avellaneda", zona: "I", tramo: null, cg: 0.5 },
  {
    barrio: "parque-chacabuco",
    zona: "I",
    tramo: "Entre límite norte y Av. Asamblea - Av. Vernet",
    cg: 0.5,
  },
  {
    barrio: "parque-chacabuco",
    zona: "I",
    tramo: "Entre Av. Asamblea - Av. Vernet y límite sur",
    cg: 0.25,
  },
  { barrio: "parque-patricios", zona: "I", tramo: null, cg: 0.25 },
  { barrio: "san-cristobal", zona: "I", tramo: null, cg: 0.5 },
  { barrio: "san-telmo", zona: "I", tramo: null, cg: 0.5 },
  { barrio: "villa-lugano", zona: "I", tramo: null, cg: 0.25 },
  {
    barrio: "villa-riachuelo",
    zona: "I",
    tramo: "Entre límite norte y Av. Coronel Roca",
    cg: 0.25,
  },
  {
    barrio: "villa-riachuelo",
    zona: "I",
    tramo: "Entre Av. Coronel Roca y límite sur",
    cg: 0,
  },
  {
    barrio: "villa-soldati",
    zona: "I",
    tramo:
      "Entre límite norte y Av. Coronel Roca - Av. Intendente Francisco Rabanal (Norte)",
    cg: 0.25,
  },
  {
    barrio: "villa-soldati",
    zona: "I",
    tramo:
      "Entre Av. Coronel Roca - Av. Intendente Francisco Rabanal (Norte) y límite sur",
    cg: 0,
  },
  // ── Zona II ──
  { barrio: "agronomia", zona: "II", tramo: null, cg: 0.75 },
  { barrio: "almagro", zona: "II", tramo: null, cg: 0.75 },
  { barrio: "balvanera", zona: "II", tramo: null, cg: 0.75 },
  {
    barrio: "belgrano",
    zona: "II",
    tramo: "Entre Av. Cabildo y límite sur",
    cg: 1.25,
  },
  {
    barrio: "caballito",
    zona: "II",
    tramo:
      "Entre límite norte y Av. Avellaneda - Neuquén - Colpayo - Av. Avellaneda",
    cg: 0.75,
  },
  {
    barrio: "caballito",
    zona: "II",
    tramo:
      "Entre Av. Avellaneda - Neuquén - Colpayo - Av. Avellaneda y Av. Juan Bautista Alberdi",
    cg: 1,
  },
  {
    barrio: "caballito",
    zona: "II",
    tramo: "Entre Av. Juan Bautista Alberdi y límite sur",
    cg: 0.75,
  },
  {
    barrio: "chacarita",
    zona: "II",
    tramo: "Entre límite este y Av. Forest - Av. Corrientes",
    cg: 1,
  },
  {
    barrio: "chacarita",
    zona: "II",
    tramo: "Entre Av. Forest - Av. Corrientes y límite oeste",
    cg: 0.75,
  },
  { barrio: "coghlan", zona: "II", tramo: null, cg: 1 },
  { barrio: "colegiales", zona: "II", tramo: null, cg: 1.25 },
  {
    barrio: "flores",
    zona: "II",
    tramo: "Entre límite norte y Av. Avellaneda",
    cg: 0.75,
  },
  {
    barrio: "flores",
    zona: "II",
    tramo: "Entre Av. Avellaneda y Av. Juan Bautista Alberdi",
    cg: 1,
  },
  {
    barrio: "flores",
    zona: "II",
    tramo: "Entre Av. Juan Bautista Alberdi y Av. Directorio",
    cg: 0.75,
  },
  {
    barrio: "floresta",
    zona: "II",
    tramo: "Entre límite norte y Av. Avellaneda",
    cg: 0.75,
  },
  {
    barrio: "floresta",
    zona: "II",
    tramo: "Entre Av. Avellaneda y Av. Juan Bautista Alberdi",
    cg: 1,
  },
  {
    barrio: "floresta",
    zona: "II",
    tramo: "Entre Av. Juan Bautista Alberdi y límite sur",
    cg: 0.75,
  },
  { barrio: "monserrat", zona: "II", tramo: null, cg: 1 },
  { barrio: "monte-castro", zona: "II", tramo: null, cg: 0.75 },
  {
    barrio: "nunez",
    zona: "II",
    tramo: "Entre Av. Cabildo y límite sur",
    cg: 1.25,
  },
  {
    barrio: "palermo",
    zona: "II",
    tramo: "Entre Av. Cabildo - Av. Santa Fe y límite sur",
    cg: 1.25,
  },
  { barrio: "parque-chas", zona: "II", tramo: null, cg: 0.75 },
  { barrio: "la-paternal", zona: "II", tramo: null, cg: 0.75 },
  {
    barrio: "recoleta",
    zona: "II",
    tramo: "Entre Av. Santa Fe y límite sur",
    cg: 1.25,
  },
  {
    barrio: "saavedra",
    zona: "II",
    tramo:
      "Entre Av. Crisólogo Larralde, Aizpurúa, Rogelio Yrurtía y Andonaegui",
    cg: 1.25,
  },
  {
    barrio: "saavedra",
    zona: "II",
    tramo:
      "Límites barriales excluida zona entre Av. Crisólogo Larralde, Aizpurúa, Rogelio Yrurtía y Andonaegui",
    cg: 1,
  },
  { barrio: "san-nicolas", zona: "II", tramo: null, cg: 1 },
  { barrio: "velez-sarsfield", zona: "II", tramo: null, cg: 0.75 },
  { barrio: "versalles", zona: "II", tramo: null, cg: 0.75 },
  {
    barrio: "villa-crespo",
    zona: "II",
    tramo: "Entre límite este y Av. Corrientes",
    cg: 1,
  },
  {
    barrio: "villa-crespo",
    zona: "II",
    tramo: "Entre Av. Corrientes y límite oeste",
    cg: 0.75,
  },
  { barrio: "villa-del-parque", zona: "II", tramo: null, cg: 0.75 },
  {
    barrio: "villa-devoto",
    zona: "II",
    tramo: "Entre límite norte y Gutenberg (Norte) (FCGU)",
    cg: 0.75,
  },
  {
    barrio: "villa-devoto",
    zona: "II",
    tramo: "Entre Gutenberg (Norte) (FCGU) y Ricardo Gutiérrez (Norte) (FCGSM)",
    cg: 1,
  },
  {
    barrio: "villa-devoto",
    zona: "II",
    tramo: "Entre Ricardo Gutiérrez (Norte) (FCGSM) y límite sur",
    cg: 0.75,
  },
  { barrio: "villa-gral-mitre", zona: "II", tramo: null, cg: 0.75 },
  { barrio: "villa-luro", zona: "II", tramo: null, cg: 0.75 },
  { barrio: "villa-ortuzar", zona: "II", tramo: null, cg: 0.75 },
  { barrio: "villa-pueyrredon", zona: "II", tramo: null, cg: 0.75 },
  { barrio: "villa-real", zona: "II", tramo: null, cg: 0.75 },
  { barrio: "villa-santa-rita", zona: "II", tramo: null, cg: 0.75 },
  { barrio: "villa-urquiza", zona: "II", tramo: null, cg: 1 },
  // ── Zona III ──
  {
    barrio: "belgrano",
    zona: "III",
    tramo: "Entre límite norte y Av. Del Libertador",
    cg: 1.75,
  },
  {
    barrio: "belgrano",
    zona: "III",
    tramo: "Av. Del Libertador (ambas aceras)",
    cg: 1.75,
  },
  {
    barrio: "belgrano",
    zona: "III",
    tramo: "Entre Av. Del Libertador y Av. Cabildo",
    cg: 1.5,
  },
  {
    barrio: "nunez",
    zona: "III",
    tramo: "Entre límite norte y Av. Del Libertador",
    cg: 1.75,
  },
  {
    barrio: "nunez",
    zona: "III",
    tramo: "Av. Del Libertador (ambas aceras)",
    cg: 1.75,
  },
  {
    barrio: "nunez",
    zona: "III",
    tramo: "Entre Av. Del Libertador y Av. Cabildo",
    cg: 1.5,
  },
  {
    barrio: "palermo",
    zona: "III",
    tramo:
      "Entre límite norte, Av. Tagle, Av. Presidente Figueroa Alcorta y Av. Jerónimo Salguero",
    cg: 2,
  },
  {
    barrio: "palermo",
    zona: "III",
    tramo: "Entre límite norte y Av. Del Libertador",
    cg: 1.75,
  },
  {
    barrio: "palermo",
    zona: "III",
    tramo: "Av. Del Libertador (ambas aceras)",
    cg: 1.75,
  },
  {
    barrio: "palermo",
    zona: "III",
    tramo: "Entre Av. Del Libertador y Av. Cabildo - Av. Santa Fe",
    cg: 1.5,
  },
  {
    barrio: "palermo",
    zona: "III",
    tramo: "Entre Av. Dorrego, Costa Rica, Fitz Roy y J. A. Cabrera",
    cg: 1.5,
  },
  {
    barrio: "palermo",
    zona: "III",
    tramo: "Entre Godoy Cruz, Costa Rica, Malabia y Gorriti",
    cg: 1.5,
  },
  { barrio: "puerto-madero", zona: "III", tramo: null, cg: 2 },
  {
    barrio: "recoleta",
    zona: "III",
    tramo: "Entre límite norte y Av. Santa Fe",
    cg: 1.75,
  },
  { barrio: "retiro", zona: "III", tramo: null, cg: 1.75 },
];

/** Fails the build if the transcription stopped covering the city: every
 * barrio needs at least one row, and every row a barrio that exists. */
function assertCoverage(): void {
  const known = new Set<string>(BARRIOS.map((b) => b.id));
  for (const row of COEFICIENTES) {
    if (!known.has(row.barrio)) {
      throw new Error(`abl-caba: unknown barrio "${row.barrio}"`);
    }
  }
  const covered = new Set(COEFICIENTES.map((r) => r.barrio));
  const missing = BARRIOS.filter((b) => !covered.has(b.id));
  if (missing.length) {
    throw new Error(
      `abl-caba: barrios with no coefficient: ${missing.map((b) => b.id).join(", ")}`,
    );
  }
}
assertCoverage();

// ── Derived ───────────────────────────────────────────────────────────────

const barrioById = new Map<string, (typeof BARRIOS)[number]>(
  BARRIOS.map((b) => [b.id, b]),
);

export const barrioLabel = (id: BarrioId): string => barrioById.get(id)!.label;

export const comunaOf = (id: BarrioId): number => barrioById.get(id)!.comuna;

/** A barrio's rows, in the law's order. */
export const subzonasOf = (id: BarrioId): Subzona[] =>
  COEFICIENTES.filter((r) => r.barrio === id);

/** The lowest and highest coefficient inside a barrio, and the fiscal zones
 * its subzonas fall in. */
export function rango(id: BarrioId): {
  min: number;
  max: number;
  zonas: ZonaFiscal[];
  subzonas: number;
} {
  const rows = subzonasOf(id);
  const cgs = rows.map((r) => r.cg);
  return {
    min: Math.min(...cgs),
    max: Math.max(...cgs),
    zonas: [...new Set(rows.map((r) => r.zona))],
    subzonas: rows.length,
  };
}

/** `1 + CG × pCG`: what a coefficient multiplies the base tasa by. */
export const factor = (cg: number): number => 1 + cg * TASA.weight;

/** The tasa on one peso of VFH at a given coefficient, before the surcharge. */
export const tasaEfectiva = (cg: number): number =>
  TASA.base * factor(cg) * TASA.usc;

/** The whole city's range of coefficients. */
export const CG_MIN = Math.min(...COEFICIENTES.map((r) => r.cg));
export const CG_MAX = Math.max(...COEFICIENTES.map((r) => r.cg));

export function segmentoDe(vfh: number): Segmento {
  return ESCALA.findLast((s) => vfh >= s.from) ?? ESCALA[0];
}

/** Art. 41, before any floor. */
export function impuestoInmobiliario(vfh: number): number {
  const s = segmentoDe(vfh);
  return s.fixed + (vfh - s.from) * s.rate * TASA.usc;
}

/** Art. 42, before the surcharge and any floor. */
export const tasaAbl = (vfh: number, cg: number): number =>
  vfh * tasaEfectiva(cg);

export type Resultado = {
  segmento: Segmento;
  /** The Impuesto Inmobiliario for the year, after the floor. */
  inmobiliario: number;
  /** The tasa for the year, after the floor. */
  tasa: number;
  /** The 1 % surcharge on the tasa, or 0 below the threshold. */
  adicional: number;
  total: number;
  /** A twelfth of the year. */
  cuota: number;
  /** Whether either tribute was raised to its half of the minimum. */
  minimo: boolean;
};

/** The year's tax as the formula determines it.
 *
 * What this is *not*: the amount on a given boleta. Art. 44 caps each cuota
 * at the previous one plus the IPCBA of five months earlier, so a property
 * whose formula figure jumped (a revaluation, the 2024 reform) is still
 * climbing toward it one capped month at a time, and its boleta is lower. The
 * cap depends on that partida's own history, which this cannot know. The page
 * says so next to every number this produces. */
export function calcular({
  vfh,
  cg,
  complementaria = false,
}: {
  vfh: number;
  cg: number;
  complementaria?: boolean;
}): Resultado {
  const half = (complementaria ? MINIMO.complementaria : MINIMO.general) / 2;
  const segmento = segmentoDe(vfh);
  const rawII = impuestoInmobiliario(vfh);
  const rawTasa = tasaAbl(vfh, cg);
  const inmobiliario = Math.max(rawII, half);
  const tasa = Math.max(rawTasa, half);
  const adicional = vfh > ADICIONAL.threshold ? tasa * ADICIONAL.rate : 0;
  const total = inmobiliario + tasa + adicional;
  return {
    segmento,
    inmobiliario,
    tasa,
    adicional,
    total,
    cuota: total / 12,
    minimo: inmobiliario > rawII || tasa > rawTasa,
  };
}

// ── Formatting ────────────────────────────────────────────────────────────

const coef = new Intl.NumberFormat("es-AR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const pesos = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});
const pct = new Intl.NumberFormat("es-AR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** "1,50". */
export const formatCoef = (v: number): string => coef.format(v);
/** "0,75–1,00", or a single value when the barrio has one. */
export const formatRango = (min: number, max: number): string =>
  min === max ? formatCoef(min) : `${formatCoef(min)}–${formatCoef(max)}`;
/** "$ 1.234.567". */
export const formatPesos = (v: number): string => pesos.format(Math.round(v));
/** A fraction as a percentage with two decimals: 0.012 → "1,20 %". */
export const formatPct = (v: number): string => `${pct.format(v * 100)} %`;
/** "19,15 millones" — for the scale's bounds, which are unreadable as digits. */
export const formatMillones = (v: number): string =>
  `${(v / 1_000_000).toLocaleString("es-AR", { maximumFractionDigits: 2 })} millones`;

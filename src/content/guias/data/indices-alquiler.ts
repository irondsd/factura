// The ICL and IPC series behind <CalculadoraAlquiler />, checked at import.
//
// Editorial reference data like `inflacion.ts`: it never touches a user's
// bills and it is baked into the build. The arithmetic lives in
// `src/lib/indicesAlquiler.ts`; this module only loads the file and refuses a
// malformed one, so a bad refresh fails the build rather than drawing a wrong
// table.
//
// ── Refreshing ──────────────────────────────────────────────────────────────
// `bun run data:alquiler` after INDEC's monthly IPC release (around the 13th).
// It rewrites `indices-alquiler.json` from the BCRA API (ICL, daily) and
// INDEC's divisions CSV (IPC nivel general, national), and refuses to change
// any value already stored. The calculator's footnote reads the last day and
// month from the data, so nothing else needs editing.

import {
  assertIndices,
  lastDay,
  lastMonth,
  type Indices,
} from "@/lib/indicesAlquiler";
import raw from "./indices-alquiler.json";

export const INDICES_ALQUILER: Indices = {
  icl: { start: raw.icl.start, values: raw.icl.values },
  ipc: { start: raw.ipc.start, values: raw.ipc.values },
};

assertIndices(INDICES_ALQUILER, "indices-alquiler.json");

/** Where each series comes from, for the calculator's footnote. */
export const FUENTES_ALQUILER = {
  icl: {
    label: "BCRA, Índice para Contratos de Locación",
    href: "https://www.bcra.gob.ar/principales-variables-datos/?serie=7988",
    hasta: lastDay(INDICES_ALQUILER.icl),
  },
  ipc: {
    label: "INDEC, IPC nivel general, total nacional",
    href: "https://www.indec.gob.ar/indec/web/Nivel4-Tema-3-5-31",
    hasta: lastMonth(INDICES_ALQUILER.ipc),
  },
} as const;

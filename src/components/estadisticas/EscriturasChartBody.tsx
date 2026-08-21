"use client";

import dynamic from "next/dynamic";

// Client-side lazy boundary; see IpcChartBody for the reason it is separate
// from the interactive implementation.
export type {
  AnualRow,
  HipotecaRow,
  HistoriaRow,
  MontoRow,
  SeasonRow,
} from "./EscriturasChartImpl";

export const HistoriaChart = dynamic(() =>
  import("./EscriturasChartImpl").then((mod) => mod.HistoriaChart),
);
export const AnualChart = dynamic(() =>
  import("./EscriturasChartImpl").then((mod) => mod.AnualChart),
);
export const HipotecasChart = dynamic(() =>
  import("./EscriturasChartImpl").then((mod) => mod.HipotecasChart),
);
export const EstacionalidadChart = dynamic(() =>
  import("./EscriturasChartImpl").then((mod) => mod.EstacionalidadChart),
);
export const MontoChart = dynamic(() =>
  import("./EscriturasChartImpl").then((mod) => mod.MontoChart),
);

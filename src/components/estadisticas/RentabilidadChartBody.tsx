"use client";

import dynamic from "next/dynamic";

// Client-side lazy boundary; see IpcChartBody for the reason it is separate
// from the interactive implementation.
export type {
  HistoryRow,
  Marker,
  Point,
  RateRow,
  RateSeries,
} from "./RentabilidadChartImpl";

export const HistoriaChart = dynamic(() =>
  import("./RentabilidadChartImpl").then((mod) => mod.HistoriaChart),
);
export const TipoCambioChart = dynamic(() =>
  import("./RentabilidadChartImpl").then((mod) => mod.TipoCambioChart),
);
export const DispersionChart = dynamic(() =>
  import("./RentabilidadChartImpl").then((mod) => mod.DispersionChart),
);

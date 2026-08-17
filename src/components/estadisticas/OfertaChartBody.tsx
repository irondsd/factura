"use client";

import dynamic from "next/dynamic";

// Client-side lazy boundary; see IpcChartBody for the reason it is separate
// from the interactive implementation.
export type { Band, CoberturaRow, Marker, SerieRow } from "./OfertaChartImpl";

export const SerieChart = dynamic(() =>
  import("./OfertaChartImpl").then((mod) => mod.SerieChart),
);
export const CoberturaChart = dynamic(() =>
  import("./OfertaChartImpl").then((mod) => mod.CoberturaChart),
);

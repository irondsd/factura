"use client";

import dynamic from "next/dynamic";

// Client-side lazy boundary; see IpcChartBody for the reason it is separate
// from the interactive implementation.
export type { CapituloRow, CostoRow } from "./ConstruccionChartImpl";

export const CostoChart = dynamic(() =>
  import("./ConstruccionChartImpl").then((mod) => mod.CostoChart),
);
export const CapitulosChart = dynamic(() =>
  import("./ConstruccionChartImpl").then((mod) => mod.CapitulosChart),
);

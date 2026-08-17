"use client";

import dynamic from "next/dynamic";

// Client-side lazy boundary; see IpcChartBody for the reason it is separate
// from the interactive implementation.
export type { HistoriaRow, HoraRow } from "./DelitosChartImpl";

export const HistoriaChart = dynamic(() =>
  import("./DelitosChartImpl").then((mod) => mod.HistoriaChart),
);
export const HoraChart = dynamic(() =>
  import("./DelitosChartImpl").then((mod) => mod.HoraChart),
);

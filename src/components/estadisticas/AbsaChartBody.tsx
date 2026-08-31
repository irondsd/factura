"use client";

import dynamic from "next/dynamic";

// Client-side lazy boundary; see IpcChartBody for the reason it is separate
// from the interactive implementation.
export type { BrechaRow, TarifaRow } from "./AbsaChartImpl";

export const TarifaChart = dynamic(() =>
  import("./AbsaChartImpl").then((mod) => mod.TarifaChart),
);
export const BrechaChart = dynamic(() =>
  import("./AbsaChartImpl").then((mod) => mod.BrechaChart),
);

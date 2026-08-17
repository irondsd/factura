"use client";

import dynamic from "next/dynamic";

// Client-side lazy boundary; see estadisticas/IpcChartBody for the reason it is
// separate from the interactive implementation.
export type { Point } from "./PrecioSeguridadChartImpl";

export const PrecioSeguridadScatter = dynamic(() =>
  import("./PrecioSeguridadChartImpl").then(
    (mod) => mod.PrecioSeguridadScatter,
  ),
);

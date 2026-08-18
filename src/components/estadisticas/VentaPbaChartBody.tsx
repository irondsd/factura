"use client";

import dynamic from "next/dynamic";

// Client-side lazy boundary; see IpcChartBody for the reason it is separate
// from the interactive implementation.
export type { PartidoOption, SerieRow, ZonaOption } from "./VentaPbaChartImpl";

export const VentaPbaSerie = dynamic(() =>
  import("./VentaPbaChartImpl").then((mod) => mod.VentaPbaSerie),
);

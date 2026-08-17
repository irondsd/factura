"use client";

import dynamic from "next/dynamic";

// Keep recharts out of content indexes and articles that do not render this
// figure. This Client Component boundary is required for Next to split the
// implementation; a dynamic import made by the server wrapper is not split.
export type {
  Measure,
  MultiRow,
  Range,
  RegionSeries,
  Row,
} from "./IpcChartImpl";

export const InteranualChart = dynamic(() =>
  import("./IpcChartImpl").then((mod) => mod.InteranualChart),
);
export const ComparacionChart = dynamic(() =>
  import("./IpcChartImpl").then((mod) => mod.ComparacionChart),
);
export const MensualChart = dynamic(() =>
  import("./IpcChartImpl").then((mod) => mod.MensualChart),
);

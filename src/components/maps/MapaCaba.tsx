"use client";

import {
  Mapa,
  type MapDimension,
  type MapRegion,
  type MapView,
} from "@/components/maps/Mapa";
import geo from "@/content/shared/caba-geo.json";

// `Mapa` bound to CABA: the 48 barrios and the 15 comunas. Every map on
// /estadisticas that shades the city goes through here, and the only thing this
// file owns is the geometry.
//
// The two path sets share one bounding box — see `build-caba-geo.ts`, which
// fits the box to the barrios and reuses it for the comunas — so the switch
// between them swaps the borders without the city changing size or shifting
// under the reader.
//
// The import is here rather than in the page: this is a client module, so the
// 42 KB of path data sits in a JS chunk cached across the section instead of
// being serialised into every page's HTML and RSC payload.

export type { MapDimension, MapRegion, MapView };

/** The geo ids this wrapper accepts in `view.geo`. */
export type CabaGeo = "barrios" | "comunas";

const PATHS: Record<string, Record<string, string>> = {
  barrios: geo.barrios,
  comunas: geo.comunas,
};

export function MapaCaba(
  props: Omit<Parameters<typeof Mapa>[0], "paths" | "viewBox" | "backdrop">,
) {
  return <Mapa {...props} paths={PATHS} viewBox={geo.viewBox} />;
}

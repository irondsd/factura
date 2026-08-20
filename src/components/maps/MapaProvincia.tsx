"use client";

import {
  Mapa,
  type MapDimension,
  type MapRegion,
  type MapView,
} from "@/components/maps/Mapa";
import pbaGeo from "@/content/shared/pba-geo.json";

// `Mapa` bound to all 135 partidos of the Provincia de Buenos Aires.
//
// The province, not the conurbano — the twin of `MapaAmba` in `MapaPba.tsx`,
// and deliberately a separate module rather than a second export beside it.
// `pba-geo.json` is 187 KB against `amba-geo.json`'s 40, and a wrapper is a
// client module: exporting both from one file would put the whole province in
// the chunk every page that draws only the metro area downloads.
//
// ── No backdrop here ──────────────────────────────────────────────────────
// The metro map draws CABA as an inert silhouette, because the conurbano is a
// ring and a ring with a hole in it stops looking like Buenos Aires. At
// province scale the city is a speck against 307.000 km² and the outline is
// unmistakable on its own, so the silhouette would be a grey dot with a
// tooltip-shaped hole in the middle of the shading. The partidos that surround
// it carry the shape.

export type { MapDimension, MapRegion, MapView };

/** The geo ids this wrapper accepts in `view.geo`. One: the province publishes
 * nothing between the partido and the province itself. */
export type PbaGeo = "partidos";

const PATHS: Record<string, Record<string, string>> = {
  partidos: pbaGeo.partidos,
};

export function MapaProvincia(
  props: Omit<Parameters<typeof Mapa>[0], "paths" | "viewBox" | "backdrop">,
) {
  return <Mapa {...props} paths={PATHS} viewBox={pbaGeo.viewBox} />;
}

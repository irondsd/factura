"use client";

import {
  Mapa,
  type MapDimension,
  type MapRegion,
  type MapView,
} from "@/components/maps/Mapa";
import gbaGeo from "@/content/shared/gba-geo.json";

// `Mapa` bound to the Gran Buenos Aires: the 26 partidos a price is published
// for, with CABA drawn as an inert silhouette in the middle.
//
// The city has to be on this map even though no figure on the page is about it.
// The conurbano is a ring, and a ring with nothing in the hole reads as a
// coastline — the shape stops being recognisable as Buenos Aires, which is the
// one thing a reader uses to find their partido. Drawn flat in
// `--choro-backdrop`, it is legible as "not part of this" at a glance and is
// not hoverable, so it can never be mistaken for a region with a value.
//
// ── Why the province map is not here yet ──────────────────────────────────
// `pba-geo.json` (all 135 partidos) is built by the same script and is four
// times the size. A wrapper for it belongs beside this one the day a page
// shades the whole province — see `.claude/terreno-m2.md`. Importing it here
// would put those 180 KB in the chunk this page loads, for a map it never
// draws.

export type { MapDimension, MapRegion, MapView };

/** The geo ids this wrapper accepts in `view.geo`. One, for now: unlike CABA
 * there is no second administrative level to switch to — a partido is the
 * smallest unit anything publishes a price for. */
export type GbaGeo = "partidos";

const PATHS: Record<string, Record<string, string>> = {
  partidos: gbaGeo.partidos,
};

const CABA = { d: gbaGeo.caba, label: "Ciudad Autónoma de Buenos Aires" };

export function MapaGba(
  props: Omit<Parameters<typeof Mapa>[0], "paths" | "viewBox" | "backdrop">,
) {
  return (
    <Mapa {...props} paths={PATHS} viewBox={gbaGeo.viewBox} backdrop={CABA} />
  );
}

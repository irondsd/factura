#!/usr/bin/env bun
/**
 * Rebuilds `src/content/shared/caba-geo.json` — the SVG outlines of
 * the 48 barrios and 15 comunas — from the city's own boundary files.
 *
 * Run: `bun scripts/build-caba-geo.ts`   (or `npm run data:caba-geo`)
 *
 * Effectively a one-off: administrative boundaries change about once a decade
 * (the comunas were drawn in 2005). It exists so the numbers in the output are
 * reproducible rather than a blob someone pasted in.
 *
 * ── Why quantise instead of simplify ──────────────────────────────────────
 * The obvious way to shrink 16.452 points is Douglas–Peucker, and it is the
 * wrong tool for a choropleth. Neighbouring barrios share a border, but each
 * ring starts at a different vertex, so simplifying them independently drops
 * different points on each side of the same line — and the map renders with
 * white slivers between barrios where the two versions of the border disagree.
 * Fixing that properly means extracting shared arcs (what TopoJSON is for).
 *
 * Snapping every coordinate to a 1-unit grid needs none of that machinery and
 * cannot desynchronise a shared border: identical inputs quantise to identical
 * outputs, whichever polygon they arrive in. The city's files are clean enough
 * for this to hold — 3.129 of the resulting vertices are shared by two or more
 * barrios, which is the shared borders staying shared.
 *
 * One grid unit is a thousandth of the city's width, so under a pixel at any
 * size this map is drawn at. The saving is in the encoding instead: relative
 * line commands between integer points compress to about a quarter of the
 * absolute form (42 KB, ~10 KB over the wire).
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { COMUNA_IDS, findBarrio } from "../src/content/shared/caba";

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(here, "../src/content/shared/caba-geo.json");

const CDN = "https://cdn.buenosaires.gob.ar/datosabiertos/datasets";
const SOURCES = {
  barrios: `${CDN}/innovacion-transformacion-digital/barrios/barrios.geojson`,
  comunas: `${CDN}/ministerio-de-educacion/comunas/comunas.geojson`,
};

/** Width of the output viewBox, in grid units. Height follows the aspect. */
const WIDTH = 1000;

/** Grid step, in the same units. 1 = a thousandth of the city's width. */
const STEP = 1;

type Ring = [number, number][];
type Feature = {
  properties: Record<string, unknown>;
  geometry:
    | { type: "Polygon"; coordinates: Ring[] }
    | { type: "MultiPolygon"; coordinates: Ring[][] };
};

/** Every ring of a feature, holes included — SVG's default fill rule punches
 * them out on its own, so they need no special handling beyond being drawn. */
const ringsOf = (f: Feature): Ring[] =>
  f.geometry.type === "Polygon"
    ? f.geometry.coordinates
    : f.geometry.coordinates.flat();

/**
 * Equirectangular, with longitudes scaled by the cosine of the city's mid
 * latitude so a degree of longitude and a degree of latitude come out the same
 * size on the ground.
 *
 * A conformal projection would be the careful choice; across the 22 km CABA
 * spans, the difference from this is far under one grid unit. `y` is negated
 * because latitude grows north and SVG's y grows down.
 */
const LAT0 = -34.6159;
const K = Math.cos((LAT0 * Math.PI) / 180);
const project = ([lon, lat]: [number, number]): [number, number] => [
  lon * K,
  -lat,
];

async function geojson(url: string): Promise<Feature[]> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return (await res.json()).features as Feature[];
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");

  const barrios = await geojson(SOURCES.barrios);
  const comunas = await geojson(SOURCES.comunas);
  console.log(`barrios: ${barrios.length}   comunas: ${comunas.length}`);

  // One bounding box for both layers, from the barrios — the comunas are the
  // same territory, and sharing the box is what lets the two maps be swapped
  // without the city changing size or shifting under the reader.
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const f of barrios) {
    for (const ring of ringsOf(f)) {
      for (const c of ring) {
        const [x, y] = project(c);
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    }
  }
  const scale = WIDTH / (maxX - minX);
  const height = Math.round((maxY - minY) * scale);

  const snap = (c: [number, number]): [number, number] => {
    const [x, y] = project(c);
    return [
      Math.round(((x - minX) * scale) / STEP) * STEP,
      Math.round(((y - minY) * scale) / STEP) * STEP,
    ];
  };

  let sourcePoints = 0;
  let keptPoints = 0;

  /** One feature as a path `d`. Relative `l` commands between integer points:
   * the deltas are one or two digits where absolute coordinates are three or
   * four, and they gzip far better for having so few distinct values. */
  function pathOf(f: Feature): string {
    let d = "";
    for (const ring of ringsOf(f)) {
      const points: [number, number][] = [];
      for (const c of ring) {
        sourcePoints++;
        const p = snap(c);
        const last = points[points.length - 1];
        if (!last || last[0] !== p[0] || last[1] !== p[1]) points.push(p);
      }
      // GeoJSON repeats the first point to close the ring; `Z` does that.
      const first = points[0];
      const last = points[points.length - 1];
      if (points.length > 3 && first[0] === last[0] && first[1] === last[1]) {
        points.pop();
      }
      // A ring that quantises down to a line has no area left to fill. None do
      // at this step, but a coarser grid would produce them.
      if (points.length < 3) continue;

      keptPoints += points.length;
      let [px, py] = points[0];
      d += `M${px} ${py}`;
      for (const [x, y] of points.slice(1)) {
        d += `l${x - px} ${y - py}`;
        px = x;
        py = y;
      }
      d += "Z";
    }
    return d;
  }

  const barrioPaths: Record<string, string> = {};
  for (const f of barrios) {
    const name = String(f.properties.nombre);
    const barrio = findBarrio(name);
    if (!barrio) {
      throw new Error(
        `boundary file has a barrio we don't know: ${JSON.stringify(name)}. Add it to data/caba.ts.`,
      );
    }
    if (barrioPaths[barrio.id])
      throw new Error(`two features for ${barrio.id}`);
    barrioPaths[barrio.id] = pathOf(f);
  }

  const comunaPaths: Record<string, string> = {};
  for (const f of comunas) {
    const id = Number(f.properties.comuna);
    if (!COMUNA_IDS.includes(id)) {
      throw new Error(`boundary file has an unknown comuna: ${id}`);
    }
    comunaPaths[String(id)] = pathOf(f);
  }

  const missing = COMUNA_IDS.filter((c) => !comunaPaths[String(c)]);
  if (missing.length) throw new Error(`no geometry for comuna ${missing}`);

  const out = {
    id: "caba-geo",
    source: "Buenos Aires Data (GCBA)",
    sourceUrl: "https://data.buenosaires.gob.ar/dataset/barrios",
    license: "CC-BY-2.5-AR",
    generatedBy: "scripts/build-caba-geo.ts",
    projection: `equirectangular, lon x cos(${LAT0}), snapped to a ${STEP}-unit grid`,
    viewBox: `0 0 ${WIDTH} ${height}`,
    barrios: barrioPaths,
    comunas: comunaPaths,
  };

  const text = `${JSON.stringify(out, null, 2)}\n`;
  console.log(
    `viewBox ${out.viewBox}   points ${sourcePoints} → ${keptPoints} (${((100 * keptPoints) / sourcePoints).toFixed(0)}%)`,
  );

  if (dryRun) {
    console.log(`--dry-run: not writing (${text.length} bytes)`);
    return;
  }
  writeFileSync(OUT, text);
  console.log(
    `wrote ${path.relative(process.cwd(), OUT)} (${(text.length / 1024).toFixed(0)} KB)`,
  );
}

await main();

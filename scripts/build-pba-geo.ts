#!/usr/bin/env bun
/**
 * Rebuilds the two Provincia de Buenos Aires map assets:
 *
 *   src/content/shared/amba-geo.json  the 27 partidos a price is published for
 *   src/content/shared/pba-geo.json   all 135 partidos of the province
 *
 * Run: `bun scripts/build-pba-geo.ts`   (or `npm run data:pba-geo`)
 *      `--dry-run`   build and report without writing
 *
 * Effectively a one-off, like its CABA twin: partido boundaries change about
 * once a generation (Lezama, the most recent, was split off Chascomús in 2009).
 * It exists so the numbers in the output are reproducible rather than a blob
 * someone pasted in, and so the next partido split is a re-run.
 *
 * ── Why two files and not one ─────────────────────────────────────────────
 * The province is 600 km across and the Gran Buenos Aires is a 60 km smudge in
 * one corner of it. A single shared bounding box — the trick `build-caba-geo`
 * uses to let the barrio and comuna maps swap without the city moving — would
 * quantise the conurbano to a grid coarse enough to erase Lanús. So each file
 * gets its own box and its own grid, and nothing ever draws both at once.
 *
 * The saving is the point: a page that only shades the 26 partidos a portal
 * publishes prices for imports 30 KB, not 180 KB. Measured on the current
 * boundary file:
 *
 *   amba-geo.json   27 features   ~45 KB   ~6 KB gzipped
 *   pba-geo.json   135 features  ~182 KB  ~25 KB gzipped
 *
 * Both are smaller over the wire than any image of the same map would be, which
 * is why these are inline SVG paths and not a PNG.
 *
 * ── Why quantise instead of simplify ──────────────────────────────────────
 * Same reasoning as `build-caba-geo.ts`, and it matters more here: partidos
 * share long borders, and simplifying each polygon independently drops
 * different points on each side of the same line, leaving white slivers between
 * neighbours. Snapping every coordinate to a grid cannot desynchronise a shared
 * border — identical inputs quantise to identical outputs, whichever polygon
 * they arrive in.
 *
 * ── The islands ──────────────────────────────────────────────────────────
 * ARBA's file carries 143 features, not 135: the delta and river islands of
 * eight partidos are filed as separate "Islas …" features. The province map
 * merges them back into their parent, because at that scale they are in
 * proportion and a Tigre without its delta is the wrong shape. The GBA map
 * drops them — see the comment at the call site, where the reasoning is about
 * what the figure is for rather than about the file.
 *
 * ── Refreshing ────────────────────────────────────────────────────────────
 * The source is the province's own open-data catalogue, CC BY 4.0. The
 * download is a 7,8 MB zip holding an 8,3 MB GeoJSON, so it is fetched and
 * unpacked in memory rather than committed.
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findPartido, PARTIDOS, PRICED_IDS } from "../src/content/shared/pba";

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT_AMBA = path.join(here, "../src/content/shared/amba-geo.json");
const OUT_PBA = path.join(here, "../src/content/shared/pba-geo.json");

/** Límites de los partidos, Datos Abiertos PBA. The zip is the only resource
 * carrying the GeoJSON; the CSV and XLSX beside it are the attribute table
 * without geometry. */
const SOURCE =
  "https://catalogo.datos.gba.gob.ar/dataset/627f65de-2510-4bf4-976b-16035828b5ae/resource/2cc73f96-98f7-42fa-a180-e56c755cf59a/download/limite-partidos-pba.zip";
const SOURCE_PAGE = "https://catalogo.datos.gba.gob.ar/dataset/partidos";
const ENTRY = "partidos-pba.geojson";

/** CABA's own boundary, for the hole in the middle of the GBA map. The city is
 * not in the province's file — of course — so it comes from the city's, the
 * same one `build-caba-geo.ts` reads. Comunas rather than barrios: 15 polygons
 * instead of 48 for a silhouette that is filled flat either way. */
const CABA_COMUNAS =
  "https://cdn.buenosaires.gob.ar/datosabiertos/datasets/ministerio-de-educacion/comunas/comunas.geojson";

/** Width of each output viewBox, in grid units. Height follows the aspect. */
const WIDTH = 1000;

/** Grid step, in the same units. 1 = a thousandth of the map's width. */
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
 * Equirectangular, with longitudes scaled by the cosine of the map's own mid
 * latitude so a degree of longitude and a degree of latitude come out the same
 * size on the ground.
 *
 * `lat0` is a parameter rather than a constant because the two maps are
 * centred five degrees apart: the conurbano sits at -34,7 and the province's
 * midpoint is near -36,8, where a degree of longitude is 3 % narrower. Using
 * the conurbano's constant for the province map would stretch Patagones.
 *
 * A conformal projection would be the careful choice. Across the conurbano the
 * difference is far under a grid unit; across the province it is visible but
 * uniform, and this map is a lookup table with a shape, not a navigation chart.
 * `y` is negated because latitude grows north and SVG's y grows down.
 */
const projector = (lat0: number) => {
  const k = Math.cos((lat0 * Math.PI) / 180);
  return ([lon, lat]: [number, number]): [number, number] => [lon * k, -lat];
};

async function geojsonFromZip(url: string, entry: string): Promise<Feature[]> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  const buf = await res.arrayBuffer();
  // Bun ships no unzip, and the whole archive is two copies of one layer, so
  // shelling out to the system `unzip` on a temp file is more moving parts than
  // reading the one entry we want straight out of the central directory.
  const zip = await import("node:zlib");
  const view = new DataView(buf);
  // End of central directory: scan back for the signature. The comment is empty
  // in this archive, so it is within the last 22 bytes, but scan anyway.
  let eocd = -1;
  for (let i = buf.byteLength - 22; i >= 0 && i > buf.byteLength - 66000; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0)
    throw new Error("not a zip: no end-of-central-directory record");
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < count; i++) {
    if (view.getUint32(p, true) !== 0x02014b50)
      throw new Error("bad central directory entry");
    const method = view.getUint16(p + 10, true);
    const compressed = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const localOffset = view.getUint32(p + 42, true);
    const name = new TextDecoder().decode(
      bytes.subarray(p + 46, p + 46 + nameLen),
    );
    if (name === entry) {
      const lNameLen = view.getUint16(localOffset + 26, true);
      const lExtraLen = view.getUint16(localOffset + 28, true);
      const start = localOffset + 30 + lNameLen + lExtraLen;
      const raw = bytes.subarray(start, start + compressed);
      const out =
        method === 0 ? Buffer.from(raw) : zip.inflateRawSync(Buffer.from(raw));
      return JSON.parse(out.toString("utf8")).features as Feature[];
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  throw new Error(`${entry} not found in ${url}`);
}

async function geojson(url: string): Promise<Feature[]> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return ((await res.json()) as { features: Feature[] }).features;
}

type Built = {
  paths: Record<string, string>;
  viewBox: string;
  sourcePoints: number;
  keptPoints: number;
  /** Projects a coordinate into this map's grid, for the CABA overlay. */
  snap: (c: [number, number]) => [number, number];
};

/**
 * Quantise a set of named features into SVG paths sharing one box.
 *
 * `extent` is what the box is fitted to, and is not always what is drawn: the
 * GBA map fits its box to the partidos and then draws CABA inside it, so the
 * city's shape cannot shift the frame the partidos are laid out in.
 */
function build(
  features: { id: string; feature: Feature }[],
  extent: { id: string; feature: Feature }[] = features,
): Built {
  const all = extent.flatMap((f) => ringsOf(f.feature).flat());
  const lat0 = all.reduce((s, c) => s + c[1], 0) / all.length;
  const project = projector(lat0);

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const c of all) {
    const [x, y] = project(c);
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
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
  const pathOf = (f: Feature): string => {
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
      // A ring that quantises down to a line has no area left to fill. The
      // province map produces a few, from the smallest delta islands.
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
  };

  const paths: Record<string, string> = {};
  for (const { id, feature } of features) {
    // Concatenated rather than assigned: a partido and its islands arrive as
    // two features and have to end up as one path.
    paths[id] = (paths[id] ?? "") + pathOf(feature);
  }

  return {
    paths,
    viewBox: `0 0 ${WIDTH} ${height}`,
    sourcePoints,
    keptPoints,
    snap,
  };
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");

  const raw = await geojsonFromZip(SOURCE, ENTRY);
  console.log(`boundary file: ${raw.length} features`);

  // Resolve every feature to a partido, folding the eight "Islas …" annexes
  // into their parent. An unknown name is fatal: it means either a partido was
  // created or ARBA renamed one, and both need a human to look at `pba.ts`.
  const resolved: { id: string; feature: Feature; island: boolean }[] = [];
  for (const feature of raw) {
    const name = String(feature.properties.municipio_nombre);
    const island = /^Islas\s/i.test(name);
    // `findPartido` folds "Islas X" onto X — see its comment; ARBA and the OVS
    // both split them out, so the normalisation lives there rather than here.
    const partido = findPartido(name);
    if (!partido) {
      throw new Error(
        `boundary file has a partido we don't know: ${JSON.stringify(name)}. Add it to src/content/shared/pba.ts.`,
      );
    }
    resolved.push({ id: partido.id, feature, island });
  }
  const islands = resolved.filter((r) => r.island).length;
  console.log(
    `resolved: ${resolved.length} features (${islands} island annexes)`,
  );

  const seen = new Set(resolved.map((r) => r.id));
  const missing = PARTIDOS.filter((p) => !seen.has(p.id)).map((p) => p.id);
  if (missing.length) {
    throw new Error(
      `no geometry for ${missing.length} partidos: ${missing.join(", ")}`,
    );
  }

  // ── The province ────────────────────────────────────────────────────────
  const pba = build(resolved);

  // ── The priced partidos, plus CABA as the hole in the middle ───────────
  // Without the delta. Tigre's and San Fernando's islands reach 50 km up the
  // Paraná, and drawn at conurbano scale they are a third of the frame and a
  // fifth of the ink — an empty pale wedge above the map, pushing the 26
  // partidos anyone came to read into the bottom two thirds. They are also not
  // what the figure measures: a portal's Tigre price is Nordelta and Tigre
  // centro, and there is no apartment market on the islands to average. The
  // province map keeps them, where they are in proportion and where the page
  // is about the whole territory.
  const pricedSet = new Set<string>(PRICED_IDS);
  const ambaFeatures = resolved.filter((r) => pricedSet.has(r.id) && !r.island);
  const amba = build(ambaFeatures);

  // Projected into the box the partidos already fixed, so the city lands where
  // it belongs rather than redefining the frame.
  const comunas = await geojson(CABA_COMUNAS);
  let caba = "";
  for (const f of comunas) {
    for (const ring of ringsOf(f)) {
      const points: [number, number][] = [];
      for (const c of ring) {
        const p = amba.snap(c);
        const last = points[points.length - 1];
        if (!last || last[0] !== p[0] || last[1] !== p[1]) points.push(p);
      }
      if (
        points.length > 3 &&
        points[0][0] === points[points.length - 1][0] &&
        points[0][1] === points[points.length - 1][1]
      ) {
        points.pop();
      }
      if (points.length < 3) continue;
      let [px, py] = points[0];
      caba += `M${px} ${py}`;
      for (const [x, y] of points.slice(1)) {
        caba += `l${x - px} ${y - py}`;
        px = x;
        py = y;
      }
      caba += "Z";
    }
  }
  console.log(
    `caba silhouette: ${comunas.length} comunas → ${caba.length} chars`,
  );

  const common = {
    source: "Datos Abiertos PBA — Límites de los partidos (ARBA)",
    sourceUrl: SOURCE_PAGE,
    license: "CC-BY-4.0",
    generatedBy: "scripts/build-pba-geo.ts",
  };

  const files: { out: string; body: Record<string, unknown>; built: Built }[] =
    [
      {
        out: OUT_AMBA,
        built: amba,
        body: {
          id: "amba-geo",
          ...common,
          note: "Los 27 partidos para los que se publica un precio —los 24 del conurbano, más Escobar y Pilar en el norte y La Plata en el sur—, sin las islas del delta de Tigre y San Fernando. `caba` es la silueta de la Ciudad, que no forma parte de la provincia y se dibuja apagada.",
          cabaSource: "Buenos Aires Data (GCBA) — comunas",
          viewBox: amba.viewBox,
          partidos: amba.paths,
          caba,
        },
      },
      {
        out: OUT_PBA,
        built: pba,
        body: {
          id: "pba-geo",
          ...common,
          note: "Los 135 partidos de la Provincia de Buenos Aires. Las islas de ocho partidos vienen como features aparte en el origen y están unidas a su partido.",
          viewBox: pba.viewBox,
          partidos: pba.paths,
        },
      },
    ];

  for (const { out, body, built } of files) {
    const text = `${JSON.stringify(body, null, 2)}\n`;
    console.log(
      `${path.basename(out)}  viewBox ${built.viewBox}  ${Object.keys(built.paths).length} partidos  points ${built.sourcePoints} → ${built.keptPoints} (${((100 * built.keptPoints) / built.sourcePoints).toFixed(0)}%)  ${(text.length / 1024).toFixed(0)} KB`,
    );
    if (dryRun) continue;
    writeFileSync(out, text);
  }

  if (dryRun) console.log("--dry-run: nothing written");
}

await main();

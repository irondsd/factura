#!/usr/bin/env bun
/**
 * Rebuilds the land-value dataset behind the "resto de la provincia" section of
 * /estadisticas/precio-m2-provincia-buenos-aires:
 *
 *   src/content/estadisticas/data/suelo-pba.json
 *
 * Run: `bun scripts/fetch-pba-suelo.ts`   (or `npm run data:suelo`)
 *      `--dry-run`   parse and report without writing
 *
 * ── The source ────────────────────────────────────────────────────────────
 * The Observatorio de Valores de Suelo (OVS) of the Provincia de Buenos Aires —
 * a provincial body, with the relevamiento itself done by LINTA-CIC. 18.042
 * georeferenced samples of *land* offered for sale, one row per parcel, with
 * its surface, its asking price in dollars and the month it was observed.
 *
 * This is the only official, province-wide figure per square metre that exists.
 * It is also not the figure a reader came for — it prices dirt, not built
 * space, and the two differ by an order of magnitude — so every consumer has to
 * label it. See `.claude/terreno-m2.md`, which is the fuller write-up and the
 * plan for the page that will publish this properly.
 *
 * ── Why WMS GetFeatureInfo and not WFS ────────────────────────────────────
 * The obvious call is WFS GetFeature, and it does not work: the server answers
 * `numberMatched: 18042` and then returns **one** feature, in WFS 1.1.0 and
 * 2.0.0 alike, whatever `count`, `maxFeatures` or `startIndex` say. It is not
 * rate limiting and retrying does not help — the viewer this GeoServer backs
 * only ever identifies one feature at a time, so the cap was never noticed.
 *
 * A WMS GetFeatureInfo with a province-sized bbox and a large `buffer` is not
 * subject to it and returns the whole table in one ~6,8 MB response. The
 * geometry is discarded here: this script writes per-partido aggregates, not
 * 18.042 points.
 *
 * ── Two method decisions, both load-bearing ───────────────────────────────
 * **Median, never mean.** `usd_m2` runs from 1 to 7.534 with a p95 eight times
 * the median. A mean is a report on the single dearest parcel in the partido.
 *
 * **Urban-scale lots only.** `sup_m2` reaches 4.630.000 — 463 hectares. The
 * relevamiento does not separate a building plot from a field, and averaging
 * them together answers no question anybody asked: a reader wanting "what does
 * land cost in Tandil" means a lot to build a house on. `MAX_SUP` cuts at
 * 5.000 m², which is the 95th percentile of the raw sample and comfortably
 * above any residential plot. The script prints how many rows that drops per
 * partido so the cut can be argued with.
 *
 * What is *not* a worry, having been checked: the currency. A log-scale
 * histogram of `prec_sd` is cleanly unimodal at tens of thousands of dollars,
 * with no second peak where a peso-denominated subset would sit, and `usd_m2`
 * is exactly `prec_sd / sup_m2` on all 18.042 rows.
 *
 * ── Refreshing ────────────────────────────────────────────────────────────
 * Effectively never. The relevamiento ran 2021–2024 and has not been extended;
 * re-running this checks whether it has. The script prints the date range it
 * found, which is the thing to read before committing.
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findPartido, PARTIDOS } from "../src/content/shared/pba";

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(here, "../src/content/estadisticas/data/suelo-pba.json");

const GEOSERVER = "https://geoserver-nodo3.ideba.gba.gob.ar/geoserver/ovs";
const LAYER = "ovs:ovs_maps_1";
const SOURCE_PAGE = "https://observatoriosuelo.gba.gob.ar/";
const VIEWER = "https://visualizador.ideba.gba.gob.ar/ovs";

/** Everything larger than this is a field, not a building plot. The 95th
 * percentile of the raw sample is 4.855 m². */
const MAX_SUP = 5000;

/** Below this many surviving samples a partido gets no published figure. A
 * median of three parcels is a report on three parcels. Consumers still see
 * `n`, so they can raise the bar; they cannot lower it. */
const MIN_N = 15;

type Sample = {
  partido: string;
  tp_nmbl: string;
  tip_vlr: string;
  fecha: string;
  sup_m2: number;
  prec_sd: number;
  usd_m2: number;
};

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};
const quantile = (xs: number[], q: number): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(s.length * q))];
};

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");

  // The declared total, so a truncated download is a failure rather than a
  // market that quietly cooled.
  const caps = await fetch(
    `${GEOSERVER}/wfs?service=WFS&version=2.0.0&request=GetFeature&typeNames=${LAYER}&count=1&outputFormat=application/json`,
    { headers: { "User-Agent": "Mozilla/5.0" } },
  );
  if (!caps.ok) throw new Error(`WFS probe → HTTP ${caps.status}`);
  const declared = ((await caps.json()) as { numberMatched: number })
    .numberMatched;

  const url =
    `${GEOSERVER}/wms?service=WMS&version=1.1.1&request=GetFeatureInfo` +
    `&layers=${LAYER}&query_layers=${LAYER}&styles=` +
    `&bbox=-64,-42,-56,-33&width=101&height=101&srs=EPSG:4326` +
    `&format=image/png&info_format=application/json&x=50&y=50` +
    `&feature_count=30000&buffer=200`;
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error(`GetFeatureInfo → HTTP ${res.status}`);
  const raw = (await res.json()) as {
    features: { properties: Sample }[];
  };
  const all = raw.features.map((f) => f.properties);
  console.log(`declared ${declared}   downloaded ${all.length}`);
  if (all.length < declared) {
    throw new Error(
      `download is short by ${declared - all.length} rows. Raise feature_count/buffer — a partial table would publish as a price change.`,
    );
  }

  // The four columns that are constant today. If one stops being constant the
  // meaning of every figure below changes, so stop rather than average across.
  for (const [field, expected] of [
    ["tp_nmbl", "terreno"],
    ["tip_vlr", "oferta"],
  ] as const) {
    const values = new Set(all.map((s) => s[field]));
    if (values.size !== 1 || !values.has(expected)) {
      throw new Error(
        `${field} is no longer always "${expected}" — found ${[...values].join(", ")}. The dataset now mixes things this script averages together.`,
      );
    }
  }

  const fechas = [...new Set(all.map((s) => s.fecha))].sort();
  console.log(
    `fechas ${fechas[0]} … ${fechas[fechas.length - 1]} (${fechas.length} distinct months)`,
  );

  const urban = all.filter((s) => s.sup_m2 > 0 && s.sup_m2 <= MAX_SUP);
  console.log(
    `lots ≤ ${MAX_SUP} m²: ${urban.length} of ${all.length} (${((100 * urban.length) / all.length).toFixed(0)} %)`,
  );

  const byPartido = new Map<string, Sample[]>();
  for (const s of urban) {
    const p = findPartido(s.partido);
    if (!p) {
      throw new Error(
        `OVS has a partido we don't know: ${JSON.stringify(s.partido)}. Add it to src/content/shared/pba.ts.`,
      );
    }
    if (!byPartido.has(p.id)) byPartido.set(p.id, []);
    byPartido.get(p.id)!.push(s);
  }

  const partidos: Record<
    string,
    {
      n: number;
      nRaw: number;
      usdM2: number | null;
      p25: number;
      p75: number;
      supMedian: number;
      priceMedian: number | null;
      from: string;
      to: string;
    }
  > = {};
  const rawCounts = new Map<string, number>();
  for (const s of all) {
    const id = findPartido(s.partido)!.id;
    rawCounts.set(id, (rawCounts.get(id) ?? 0) + 1);
  }

  for (const p of PARTIDOS) {
    const rows = byPartido.get(p.id);
    if (!rows?.length) continue;
    const v = rows.map((r) => r.usd_m2);
    const months = rows.map((r) => r.fecha).sort();
    partidos[p.id] = {
      n: rows.length,
      nRaw: rawCounts.get(p.id) ?? rows.length,
      // Below the threshold the count is still published — the page says "too
      // few" rather than pretending the partido isn't there — but the figure is
      // not.
      usdM2: rows.length >= MIN_N ? median(v) : null,
      p25: quantile(v, 0.25),
      p75: quantile(v, 0.75),
      supMedian: median(rows.map((r) => r.sup_m2)),
      // The whole lot, not the metre — the number somebody asking "what does a
      // plot in Tandil cost" actually wants. Taken as its own median of
      // `prec_sd` rather than as `usdM2 × supMedian`, which is a product of two
      // medians and is nobody's asking price: in San Pedro they are half
      // apart. Withheld on the same threshold as `usdM2`, for the same reason.
      priceMedian:
        rows.length >= MIN_N ? median(rows.map((r) => r.prec_sd)) : null,
      from: months[0],
      to: months[months.length - 1],
    };
  }

  const withFigure = Object.values(partidos).filter((x) => x.usdM2 !== null);
  const covered = Object.keys(partidos).length;
  console.log(
    `partidos with samples ${covered} of ${PARTIDOS.length}   with a published median (n ≥ ${MIN_N}) ${withFigure.length}`,
  );
  const thin = Object.entries(partidos)
    .filter(([, x]) => x.usdM2 === null)
    .map(([id, x]) => `${id}(${x.n})`);
  if (thin.length) console.log(`too few samples: ${thin.join(" ")}`);

  const provincial = median(urban.map((r) => r.usd_m2));
  const provincialLot = median(urban.map((r) => r.prec_sd));
  const provincialSup = median(urban.map((r) => r.sup_m2));

  const out = {
    id: "suelo-pba",
    title:
      "Precio de oferta del m² de terreno en la Provincia de Buenos Aires, por partido",
    source: "Observatorio de Valores de Suelo (OVS), Provincia de Buenos Aires",
    sourceUrl: SOURCE_PAGE,
    viewerUrl: VIEWER,
    sourceNote:
      "Relevamiento de LINTA-CIC. Precios de oferta de terrenos, no de departamentos construidos, y no es una serie: es una foto de 18.042 muestras tomadas entre 2021 y 2024.",
    unit: "USD por m² de terreno",
    generatedBy: "scripts/fetch-pba-suelo.ts",
    method: {
      maxSupM2: MAX_SUP,
      minSamples: MIN_N,
      statistic: "mediana",
    },
    coverage: {
      samplesTotal: all.length,
      samplesUrban: urban.length,
      partidosWithSamples: covered,
      partidosWithFigure: withFigure.length,
      partidosTotal: PARTIDOS.length,
      from: fechas[0],
      to: fechas[fechas.length - 1],
    },
    provincial,
    provincialLot,
    provincialSup,
    partidos,
  };

  const text = `${JSON.stringify(out, null, 2)}\n`;
  console.log(
    `provincial median ${provincial} USD/m² · lote ${provincialLot} USD de ${provincialSup} m²`,
  );
  if (dryRun) {
    console.log(
      `--dry-run: not writing (${(text.length / 1024).toFixed(0)} KB)`,
    );
    return;
  }
  writeFileSync(OUT, text);
  console.log(
    `wrote ${path.relative(process.cwd(), OUT)} (${(text.length / 1024).toFixed(0)} KB)`,
  );
}

await main();

# Authoring a statistics page (`/estadisticas`)

The statistics section publishes **datasets**, not articles. Each page takes one
public series, explains what it measures and who publishes it, draws it, and
links back to the source. The prose exists to make the numbers readable; the
numbers are the point.

Spanish-only, like `/guias`. If you're writing a plain article rather than
publishing a series, it belongs in `/guias` — see the spec there.

---

## 1. URL shape

A page's URL is a **path**, not a single slug, so a statistic can grow from one
national page into a page per province:

```
/estadisticas/inflacion              ← the national page
/estadisticas/alquiler               ← another statistic, national
/estadisticas/alquiler/caba          ← the same statistic, one district
/estadisticas/alquiler/santa-cruz
```

Rules:

- Segments are lowercase, hyphenated, **no accents or ñ**.
- Keep them short and descriptive — three or four words. There is no length
  limit that hurts you directly, but the slug is joined by every child page
  below it, so a long one is paid for on seven URLs rather than one.
- **Every intermediate segment must be a page of its own.** You cannot ship
  `/estadisticas/alquiler/caba` without `/estadisticas/alquiler` — the
  breadcrumb would link to a 404, so `pages.ts` fails the build instead.
- A hub lists its children wherever it places `<Subpaginas />`. See §4.

**Renaming a live page** means adding a redirect from the old path in
`redirects()` in `next.config.ts`, `permanent: true`. Config redirects run
_before_ the proxy (see the routing order in Next's `rewrites` doc), so a bare
source path is matched before the proxy rewrites it into the `/es` tree.

---

## 2. Two files per page

### The `.mdx`

`src/content/estadisticas/<path>.mdx` — e.g. `inflacion.mdx`, or
`alquiler/caba.mdx` for a nested page.

### The registry entry

Unlike the guides, the section has an explicit registry. Add one entry to
`ENTRIES` in `src/content/estadisticas/pages.ts`:

```ts
{
  slug: ["alquiler", "caba"],
  crumb: "CABA",              // short label: breadcrumbs and listings
  file: "alquiler/caba.mdx",
  load: () => import("./alquiler/caba.mdx"),
},
```

Order in `ENTRIES` is the order the index lists them. Everything else — the
index, the sitemap, `llms.txt`, the social card, the JSON-LD — follows from
there.

---

## 3. The `meta` block

A plain JS object at the top of the `.mdx`. The full field list, with what each
one is for, is the `StatsMeta` type in `pages.ts` — read it rather than copying
blindly. The fields the guides don't have:

- **`sources`** — where the numbers come from. Rendered as the page's sources
  block _and_ read by the `Dataset` JSON-LD as the dataset's creator. One list,
  both consumers: a page can't cite a source it doesn't show.
- **`dataset`** — what the series is, for the `Dataset` structured data. This is
  the markup that puts the page in dataset search rather than only in web
  search, so fill it in properly.
- **`ogStat`** — one figure on the social card. These pages usually have one.

`temporalCoverage` should be **derived from the data**, not typed in — otherwise
it goes stale the first time the series is refreshed. Import it:

```mdx
import { TEMPORAL_COVERAGE } from "./data/ipc-vivienda";
```

`updated` is editorial and stays manual: bump it whenever you refresh the data
or rewrite the prose. It is what the page's dateline shows, what the listings
sort by, and what the sitemap reports.

---

## 4. The body

Two sections before the first figure, in this order:

1. **Introduction** (no heading, above the first `##`) — what the statistic is,
   why it matters, and why Factura publishes it. Anything a reader must know
   _before_ seeing the number — that these are asking prices, say — goes here
   and nowhere else.
2. **`## Qué vas a encontrar en esta página`** — the page's own contents, **as a
   bullet list, one line per section**. Prose here is the mistake to avoid: it
   duplicates the table of contents directly above it and it is what pushes the
   figure below the fold.

**Then the page's main figure, as early as the third `##`.** On a phone that is
the whole design constraint: the reader came for the number, and every screen of
prose before it is a screen they scroll past or bounce on. Measure it — the map
on the two CABA pages sat 3.8 screens down on a 390×844 viewport before this
rule existed, and half of that was the two sections that now follow the figure.

**`## Cómo se mide …`** — what the index measures, in what unit, how it's
collected, which agency publishes it and how often, and what each geography
covers — belongs **after** the figure. It is the reader's second question, not
their first, and the one caveat that cannot wait (what a striped region means,
how many are missing) is already in the figure's own note.

Then one `##` per region or cut, each followed by its figures. Then `<Faq />`
and `<Fuentes />` at the very end.

On a **hub** — a page with child pages — add a section for them and place
`<Subpaginas />` under it. The tag renders the list of children and nothing else,
so the heading and the sentence introducing it are the page's own. On a leaf it
renders nothing.

`##` headings become the table of contents automatically. `<Faq />` and
`<Fuentes />` are appended to it as sections even though they have no heading in
the body.

**A heading you intend to link to from another page should slug to plain
ASCII.** `## Comparación entre regiones` becomes `#comparación-entre-regiones`,
which every link to it then carries percent-encoded. Rephrasing to
`## Las seis regiones, comparadas` gets the same meaning and a clean anchor.
Same-page links from the table of contents are fine either way.

### A page per region, without six copies of one page

A set of sibling pages that all cut the same series is the one shape in this
section that can go wrong: six documents differing only in a proper noun is a
doorway, and reads like one. Each region page must carry, beyond its charts:

- an intro about **that region** — what it covers, and the thing that makes its
  bills different (which distributors, which climate, which special regime);
- its own numbers, from a component that reads the data (`<ResumenRegion />`),
  including at least one fact that only exists on a region page — where it ranks
  against the others;
- its own `faq`, answering what someone in _that_ region would ask;
- its own `title`, `description`, `keywords` and `dataset.spatialCoverage`.

Shared methodology belongs on the hub, linked, not repeated six times.

---

## 5. Numbers in prose — don't

The prose is written once and the data is refreshed every month, so **any figure
you type into a paragraph is a figure that will be wrong later**. Two rules:

- Put current values in a component that reads the data module (`<ResumenIpc />`
  is the pattern: a table of the latest period, always in sync).
- Keep the prose qualitative and durable — geography, methodology, what a reader
  should look for. Not rankings, which flip; not percentages, which move.

Same rule for chart captions: they live in the chart component, next to the
data, and never in the `.mdx`.

---

## 6. Data files

Raw series live in `src/content/estadisticas/data/` as **JSON**, one file per
series, with a `.ts` module beside it that owns the meaning: the region
registry, the derived series, the labels, the formatting.

The JSON is the thing a human appends to each month. Keep it boring — one object
per period, one line each, all series present:

```json
{ "period": "202607", "nacional": 0.0, "gba": 0.0, … }
```

The `.ts` module should **fail the build on a malformed append** (see
`assertConsecutive` in `ipc-vivienda.ts`): a skipped or duplicated month turns
"the same month a year earlier" into a lie that looks like data rather than like
a bug.

Refresh instructions for a series belong in the header comment of its `.ts`
module, next to the code that reads it — not here.

---

## 7. Charts

Figures use **recharts**, the same library as the signed-in app's charts, so a
hovered point gives its exact value instead of a pixel to eyeball against an
axis. A figure is split in two, and the seam matters:

- `IpcViviendaChart.tsx` — a **server** component. Owns the `<figure>` shell,
  the caption and the source note, and shapes the dataset into plain rows.
- `IpcChartBody.tsx` — `"use client"`. Owns the heading, the stat line, any
  control (the year picker), and the plot.

Anything that changes when the reader clicks something belongs on the client
side of that line, _including the text that describes it_: a stat line that
still quotes 2026 under a chart showing 2020 is worse than no stat line. Nothing
is lost to search by putting text there — a client component is server-rendered
too, so the initial HTML carries the heading, the figures and the control. Only
the plot waits for the browser, because recharts has to measure a box first.

Three rules worth stating:

- **Put the numbers in the HTML as text.** The plot isn't in the markup, so
  without a stat line the page would carry no figures at all for a crawler.
- **Give the chart wrapper a fixed height.** `ResponsiveContainer` renders
  nothing until it has measured, so an auto-height wrapper collapses and then
  jumps.
- **Share one scale across every cut of the same measure.** A per-chart
  auto-scale makes the calmest region look exactly as convulsed as the wildest,
  which defeats the reason for showing them side by side. Where a shared scale
  can't work — the monthly charts, where 2020 moved by tenths of a point and
  2024 by forty — share it across the _regions_ and say in the note what the
  axis is doing.

Compute axis ticks with `niceTicks` (`lib/svg-chart.ts`) and pass them to the
`YAxis` rather than letting recharts pick, so gridlines land on round numbers
and zero is always one of them.

Register a new chart component in `src/mdx-components.tsx` so `.mdx` can use it
without an import.

---

## 8. Before you ship

```bash
bun run typecheck && bun run lint && bun run test && bun run build
```

Then open the page and read it. Check the table of contents matches the
headings, the last-updated date matches the last data point, and every source
link resolves.

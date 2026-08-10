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
- **Every intermediate segment must be a page of its own.** You cannot ship
  `/estadisticas/alquiler/caba` without `/estadisticas/alquiler` — the
  breadcrumb would link to a 404, so `pages.ts` fails the build instead.
- A page with children lists them at its foot automatically. Nothing to wire.

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
  block *and* read by the `Dataset` JSON-LD as the dataset's creator. One list,
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

Three sections before the charts, in this order:

1. **Introduction** (no heading, above the first `##`) — what the statistic is,
   why it matters, and why Factura publishes it.
2. **`## Qué vas a encontrar en esta página`** — the page's own contents, plus
   the at-a-glance figure for the latest period.
3. **`## Cómo se mide …`** — what the index measures, in what unit, how it's
   collected, which agency publishes it and how often, and what each geography
   covers.

Then one `##` per region or cut, each followed by its figures. Then `<Faq />`
and `<Fuentes />` at the very end.

`##` headings become the table of contents automatically. `<Faq />` and
`<Fuentes />` are appended to it as sections even though they have no heading in
the body.

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

Figures are server-rendered SVG, not recharts: these pages are static and
crawled, and a charting library is a large download for a picture that can't
change between builds. See `components/estadisticas/IpcViviendaChart.tsx`, and
`lib/svg-chart.ts` for the shared geometry.

Two rules that matter more than they look:

- **Lay out every figure twice**, wide and narrow, with CSS picking one. An SVG
  scales its text along with everything else, so one wide viewBox squeezed onto
  a phone renders 12px labels at 6px.
- **Share one scale across every cut of the same measure.** A per-chart
  auto-scale makes the calmest region look exactly as convulsed as the wildest,
  which defeats the reason for showing them side by side.

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

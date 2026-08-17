# Authoring a research page (`/investigaciones`)

The research section publishes **findings**, not series. Each page takes two or
more public datasets that Factura already publishes under `/estadisticas`, joins
them, and answers a question none of them answers alone. The arithmetic is the
point; the prose exists to make it arguable.

Spanish-only, like `/guias` and `/estadisticas`.

**This section shares its machinery with `/estadisticas`.** The registry format,
the `meta` block, the routes, the social card, the JSON-LD, the validator and
most of the spec below are identical — see `src/content/section.ts` and
`../estadisticas/AUTHORING.md`, which is the fuller document. What follows is
only what is different here.

---

## 1. Is it a research page or a statistics page?

The line is what the page is _for_, and it decides which directory the `.mdx`
goes in:

|             | `/estadisticas`           | `/investigaciones`           |
| ----------- | ------------------------- | ---------------------------- |
| Publishes   | one series                | a join of several            |
| Answers     | "what is the number"      | "so which one should I pick" |
| Data module | reads a `.json` on disk   | reads other data modules     |
| Refreshed   | when the agency publishes | when any input moves         |

The practical test: **if the page would still be worth publishing with the prose
deleted, it is a statistic.** If deleting the prose leaves numbers nobody can
interpret, it is research.

A corollary worth taking seriously: a research page must not become the only
place a series is visible. If a join needs a dataset that `/estadisticas` doesn't
publish yet, publish the statistics page first and join it afterwards.

---

## 2. Two files per page, plus a data module

- `src/content/investigacion/<slug>.mdx`
- one entry in `ENTRIES` in `src/content/investigacion/pages.ts`
- `src/content/investigacion/data/<name>.ts` — the join

The registry entry is the same four fields as `/estadisticas`:

```ts
{
  slug: ["barrios-seguros-baratos-caba"],
  crumb: "Barrios seguros y baratos",
  file: "barrios-seguros-baratos-caba.mdx",
  load: () => import("./barrios-seguros-baratos-caba.mdx"),
},
```

### The data module

Unlike a statistics data module, this one owns **no JSON**. It imports the
modules under `../../estadisticas/data`, joins them, and exports the derived
figures. `alquiler-seguridad.ts` is the model, and
`estadisticas/data/rentabilidad-caba.ts` is the same shape one section over.

Three rules, all of which exist because the arithmetic is invisible in the
output:

- **Write the method in the header comment, including what was rejected.** Every
  join makes choices that could reasonably have gone the other way. The reader
  of the module — and the page that has to explain itself — needs the reasoning,
  not just the formula.
- **Derive the period axis; never assume the inputs share one.** Two agencies
  publish on different calendars. Either intersect them (as `rentabilidad-caba`
  does) or pair the latest of each and say so on every figure (as
  `alquiler-seguridad` does). Silently pairing mismatched vintages is the bug
  that looks like data.
- **Export a `coverage()` that names what dropped out.** A join is only as wide
  as its narrowest input, and the regions that fall out are almost never a random
  sample. See §4.

---

## 3. The `meta` block

Identical to `/estadisticas` — `SectionMeta` in `src/content/section.ts` is the
type, and the validator enforces the same limits. Two fields need reading
differently here:

- **`sources`** are the agencies whose figures went into the join, not Factura.
  A derived dataset still has creators, and they are the people who counted.
- **`dataset`** describes the **derived** table: `variableMeasured` should list
  the columns the join produces (a percentile, a score, a fitted slope), not only
  the inputs. That is the thing this page publishes and nobody else does.
- **`preview`**, if set, lives in `public/img/investigacion/previews/` and is
  named after the slug with its segments joined by `-`.

`temporalCoverage` must be imported from the data module, same as the statistics
pages:

```mdx
import { TEMPORAL_COVERAGE } from "./data/alquiler-seguridad";
```

---

## 4. The body

The `/estadisticas` §4 structure applies unchanged: intro, then
`## Qué vas a encontrar en esta página` as a bullet list, then the first figure
by the third `##` at the latest, then the sections, then `<ClosingCta>`, `<Faq />`
and `<Fuentes />` bare at the end.

What a research page has to carry beyond that — and what the section is worth
nothing without — is **three figures that argue against its own result**:

1. **The method made visible.** Not a paragraph explaining the arithmetic; a
   figure that shows why it had to be that arithmetic.
   `<PrecioSeguridadResumen />` prints the spread of both variables, which is
   the whole reason that page works in ranks rather than levels.
2. **A sensitivity pass.** Recompute the finding under every assumption a reader
   could reasonably challenge and publish what happens. A result that survives
   the recomputation is the page's answer; one that doesn't is a finding about
   the method, and both are worth printing.
3. **A coverage pass.** Name the regions the join cannot see, ordered by
   something that makes the omission legible — not alphabetically. On the
   barrios page the missing rows are ordered by how quiet they are, which turns
   an apology into the second-most-useful list on the page.

Beyond those, the same rule as `/estadisticas` §5 applies twice as hard: **no
current values typed into prose.** A research page's prose is arguing about a
result that moves, so it must stay qualitative — geography, method, direction —
and every number must come from a component that reads the join.

### Linking back

Every research page **must** carry a `<PaginaRelacionada href="/estadisticas/…" />`
card for each series it joins. That is not decoration: it is where a reader goes
to check the input, and it is what keeps the sections from looking like two
places publishing the same thing.

---

## 5. Figures

Same split as `/estadisticas` §7 — a server component owning the `<figure>`
shell and every formatted string, a `"use client"` body owning anything that
changes when the reader clicks. Components live in
`src/components/investigacion/` and must be imported directly by the `.mdx`
page that renders them. Do not register data figures in `src/mdx-components.tsx`:
that map is shared by every content page, so a figure there ships its client
code to unrelated routes.

Two things a research figure does that a statistics figure usually doesn't:

- **Put the choice in the reader's hands where there is one.** A combined score
  needs a weight, and there is no correct weight — it is a preference. Offering
  it as a control (as the map's _Qué pesa más_ switch does) is the difference
  between publishing a method and publishing an opinion.
- **Evaluate any fit server-side and pass the result down.** The drawn line and
  the quoted coefficient have to come from one computation, or the page can end
  up describing a model it doesn't draw.

Maps reuse `@/components/maps/MapaCaba`, which knows the city's geometry
and nothing about what is being measured. Do not copy it.

---

## 6. Before you ship

```bash
bun run validate:content && bun run typecheck && bun run lint && bun run test && bun run build
```

`bun run validate:investigacion` is the same pass over this section alone. Then
open the page and read it: check that the table of contents matches the
headings, that every figure states the vintage of both its inputs, and that no
sentence claims a ranking the data no longer supports.

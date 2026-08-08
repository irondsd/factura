# Authoring a Guide (`/guias`) — format spec

This document tells you (or an AI assistant) exactly how to produce a guide
article for Factura's `/guias` section. Paste this whole file into a chat along
with your topic + requirements, and ask for a finished `.mdx` file.

The guides section is **Spanish-only**. Every guide is one `.mdx` file. Adding a
file is all that's needed — the index page, homepage promo, `sitemap.xml`, and
`llms.txt` pick it up automatically on the next build. There is no registry to
edit.

---

## 1. File location & slug

- Save the file at: `src/content/guias/<slug>.mdx`
- The **filename is the URL**: `<slug>.mdx` → `https://factura.uno/guias/<slug>`
- Slug rules: lowercase, words separated by hyphens, **no accents or ñ**, no
  spaces. Make it keyword-rich and Spanish.
  - Good: `como-leer-un-recibo-de-expensas`, `que-son-las-expensas-en-argentina`
  - Bad: `Guía 1.mdx`, `cómo-leer.mdx`, `articulo_final.mdx`

---

## 2. The `meta` block (required, at the very top)

Every guide **must** start with a `meta` export. It is a plain JS object — quote
all strings, keep the trailing comma style. No YAML `---` frontmatter.

```mdx
export const meta = {
  title: "Cómo leer una factura de luz: guía paso a paso",
  description:
    "Aprende a entender tu factura de electricidad: cargos fijos, consumo en kWh, impuestos y el total a pagar, explicados con un ejemplo simple.",
  summary:
    "Qué significa cada sección de la factura de electricidad y cómo identificar lo que realmente estás pagando.",
  keywords: [
    "cómo leer una factura de luz",
    "entender factura de electricidad",
    "consumo kWh",
  ],
  categories: ["servicios", "leer-facturas"],
  published: "2026-06-29T09:00:00-03:00",
  updated: "2026-06-29T09:00:00-03:00",
};
```

| Field         | Used for                                                       | Rules / length                                                       |
| ------------- | -------------------------------------------------------------- | -------------------------------------------------------------------- |
| `title`       | Browser `<title>`, the on-page `<h1>`, OG/Twitter, JSON-LD     | ~50–60 chars. Put the primary keyword near the front.                |
| `description` | `<meta name="description">`, OG/Twitter description            | ~150–160 chars. One compelling sentence; this is the search snippet. |
| `summary`     | The `/guias` index cards, the homepage list, `llms.txt`        | One short sentence (~90–120 chars). Can differ from `description`.   |
| `keywords`    | `<meta name="keywords">`                                       | 3–6 real Spanish search phrases. Lowercase.                          |
| `categories`  | Grouping on `/guias`, the breadcrumb, related-guide picks      | 1–3 ids from the list below. **The first one is the primary.**       |
| `published`   | Article dateline, JSON-LD `datePublished`, sitemap             | Full ISO 8601 **with offset**. Set once, don't change.               |
| `updated`     | Dateline (shown only if ≠ published), JSON-LD, sitemap lastmod | Full ISO 8601 **with offset**. Bump when you meaningfully edit.      |

### Timestamps

Both dates are full ISO 8601 with a timezone offset — `2026-06-29T09:00:00-03:00`
— not bare `YYYY-MM-DD`. `-03:00` is Argentina; use it unless you have a reason
not to. Google only _requires_ the date, but [recommends the time and timezone
in markup](https://developers.google.com/search/docs/appearance/publication-dates)
for precision, and it _requires_ the visible date to match the structured data —
so the page renders the same timestamp it puts in the JSON-LD, and the validator
rejects a date without a time.

Use the real time you publish at. The 15 guides written before this field existed
all carry a nominal `T09:00:00-03:00`, because their actual publishing time was
never recorded — don't copy that placeholder into a new guide.

### Choosing `categories`

Categories work like tags: pick every one that genuinely applies, **most
important first**. The first id is the guide's _primary_ category — it decides
which section the guide is grouped under on `/guias` and which crumb shows in its
breadcrumb. The others don't move the guide; they widen where it surfaces
(category pages, "related guides" on other articles).

| id                 | Label                     | Use it for                                                           |
| ------------------ | ------------------------- | -------------------------------------------------------------------- |
| `expensas`         | Expensas                  | Anything about expensas, consorcios and gastos comunes.              |
| `servicios`        | Servicios del hogar       | A specific utility: luz, gas, agua, internet, telefonía.             |
| `impuestos`        | Impuestos y tasas         | Taxes and levies on the home: AGIP's Inmobiliario/ABL, Patentes.     |
| `subsidios`        | Subsidios y tarifa social | Energy subsidies (SEF/ReSEF) and AySA's tarifa social.               |
| `inflacion`        | Inflación                 | Inflation itself, and how it moves the price of a household service. |
| `leer-facturas`    | Cómo leer una factura     | Walkthroughs of an actual bill — what each section/field means.      |
| `ahorro-y-control` | Ahorro y control          | Reference values, detecting wrong charges, tracking spend over time. |
| `pagos-y-tramites` | Pagos y trámites          | Paying, due dates, and paperwork like scanning or filing bills.      |

Two is the usual number: one for the _topic_, one for the _task_. A vendor bill
walkthrough is `["servicios", "leer-facturas"]`; a piece on what expensas include
is `["expensas", "ahorro-y-control"]`. Only ids in the table are valid — the
validator rejects anything else. The canonical list lives in
[`categories.ts`](./categories.ts); adding a category means editing that file, so
don't invent one inline.

---

## 3. The body

**Do NOT write a title / `# H1`, the date, or a "Guía" label** — the page renders
all of those automatically from `meta`. The body starts with the article's
**intro paragraph**, then sections.

Structure:

- Start with 1–2 intro paragraphs (no heading) that include the primary keyword
  naturally in the first sentence or two.
- Use `##` for each main section (these get anchor IDs for deep links).
- Use `###` for sub-sections, and `####` for small uppercase mono labels.
- End with a short CTA section (see §5).

**Voice:** neutral Latin-American Spanish, **tú** (not vos/usted), professional
but plain. Use "aquí" not "acá". No peninsular vocabulary. Short paragraphs.

---

## 4. Formatting cheatsheet

All standard Markdown + GitHub-Flavored Markdown works and is styled to match the
site. You do not need any CSS classes — just write Markdown.

```mdx
**negrita** y _cursiva_

- viñeta
- otra viñeta

1. paso uno
2. paso dos

> Cita o consejo destacado.

`código en línea`

| Columna A | Columna B |
| --------- | --------- |
| valor     | valor     |

--- ← regla horizontal (separador de sección)

![texto alternativo](/ruta/a/imagen.png)
```

Notes:

- Leave a blank line between block elements (paragraphs, lists, tables, headings).
- Images are optional; reference static files under `public/` with an absolute
  path (`/...`). Always provide alt text.

---

## 5. Links, interlinking & CTAs

**Links** — write them as normal Markdown:

- Internal links (start with `/`) become client-side navigations automatically:
  `[qué son las expensas](/guias/que-son-las-expensas-en-argentina)`
- External links open in a new tab automatically.
- **Interlink between guides** whenever relevant — it helps SEO and readers.

**CTA components** — these are available directly in the body, no import needed:

```mdx
<CtaRow>
  <DemoCta />
  <SignupCta />
</CtaRow>
```

- `<DemoCta />` → outline button to `/demo`. Default label "Ver la demo".
  Override: `<DemoCta>Probar la demo</DemoCta>`
- `<SignupCta />` → solid button to `/login`. Default "Crear una cuenta gratis".
- `<CtaButton href="/docs" variant="outline">Leer los docs</CtaButton>` →
  generic button. `variant` is `"solid"` (default) or `"outline"`.
- `<CtaRow>…</CtaRow>` → wraps buttons so they sit in a row.
- `<ProbarCta vendor="Edesur" noun="boleta">copy…</ProbarCta>` → a full-width
  card pointing at `/probar`. All three optional: `vendor` names the issuer in
  the headline, `noun` is what the document is called (defaults to `"factura"` —
  use `"boleta"` for AGIP, `"liquidación"` for expensas), and the children
  replace the default body copy.

**`<ProbarCta />` — where and how.** Put it **mid-article, right before the
closing "automáticamente" section**, not in the footer CTA row. The whole point
is that it reaches the reader while the bill the guide describes is still open in
front of them; by the closing row they've already decided. One per guide.

It belongs in any guide walking through a real document — the `leer-facturas`
category, essentially. Skip it on conceptual pieces (what expensas are, how a
subsidy works) where the reader has no PDF in hand.

Keep the copy honest about the outcome: **"mira qué datos extrae"**, never "la
leemos" or "la procesamos correctamente". Most vendors don't have a parser yet,
and a bill that fails is a normal, useful outcome — `/probar` asks who it's from
and takes an address to write back. Promising a clean read sets up the one
disappointment this card can cause.

**Charts** — `<InflacionChart chart="luz-y-gas" />` drops a chart into the body.
It takes one prop, the id of a chart in the registry; the data and the drawing
both live in the code, so a guide never carries numbers of its own:

```mdx
<InflacionChart chart="servicios-vs-general" />
```

| `chart`                      | Shows                                                     |
| ---------------------------- | --------------------------------------------------------- |
| `servicios-vs-general`       | Luz y gas + vivienda + IPC general, todos desde nov-2023. |
| `cuanto-subio-cada-servicio` | Barras: por cuánto se multiplicó cada gasto.              |
| `pesos-vs-dolares`           | La energía del hogar en pesos y en dólares.               |
| `luz-y-gas`                  | Energía contra el IPC general.                            |
| `expensas`                   | Expensas y alquiler contra el IPC general.                |
| `agua-y-vivienda`            | La división vivienda (donde entra el agua) contra el IPC. |
| `internet-y-celular`         | Telefonía e internet contra el IPC general.               |

The series come from [`data/inflacion.ts`](./data/inflacion.ts) — INDEC's IPC for
GBA rebased to November 2023 = 100, plus the dólar blue. That file's header
explains how to extend them when INDEC publishes a new month; **if you quote a
figure from a chart in your prose, re-check it after a refresh.** Adding a new
chart means adding its id to `CHART_IDS` there and its spec in
`components/guides/InflacionChart.tsx`. The validator rejects an unknown id.

**FAQ** — `<Faq />` renders a "Preguntas frecuentes" block from `meta.faq`. Like
`<RelatedGuides />` it takes no props: the article route injects the list, so the
body controls placement and `meta` controls content. Put it **after your closing
section, just above `<RelatedGuides />`**.

Declaring `meta.faq` also emits `FAQPage` JSON-LD, built from the same list — the
markup can never claim a question the page doesn't visibly answer. The validator
errors if `meta.faq` is set without `<Faq />` in the body, or the reverse.

```mdx
faq: [
{ q: "¿Por qué mi factura vino tan cara?", a: "Compara los kWh, no los pesos…" },
],
```

Rules that matter:

- **Answers are plain text.** No markdown, no HTML — the rendered text and the
  schema text have to be identical, and a markdown link would render as literal
  brackets. Put links in the prose instead. The validator rejects markup here.
- **4–6 questions**, phrased the way someone would actually search — "¿por qué mi
  factura de Edenor vino el doble?", not "Consideraciones sobre la facturación".
- **Answer in 2–4 sentences.** These target long-tail queries and "People also
  ask"; a full section belongs in the body, not here.
- Don't expect a rich result. Google restricted FAQ rich results to government
  and health sites in 2023 — the payoff is the visible answers ranking for
  questions the body doesn't cover, not a fancier snippet.

**Related guides** — `<RelatedGuides />` renders a "Guías relacionadas" block
with three other guides, picked automatically from the ones sharing this guide's
`categories`. It takes no props — don't pass the slug or a list, the page fills
it in.

```mdx
<RelatedGuides />
```

Put it **just above the closing `<CtaRow>`**, after your final paragraph. It's
the one component whose position you control and whose content you don't, so a
missing tag silently means no block — the validator warns if you forget it.

**Every guide should end** with the same closing shape: a short "Léelo
automáticamente" section tying the topic back to the product, then
`<RelatedGuides />`, then a `<CtaRow>` with `<DemoCta />` and `<SignupCta />`.

---

## 6. SEO checklist (apply before finishing)

- [ ] Primary keyword is in `title`, in the first paragraph, and in at least one `##`.
- [ ] `description` reads like a search result and is ~150–160 chars.
- [ ] 3–6 realistic `keywords`.
- [ ] 1–3 `categories`, most important first (the first is the primary).
- [ ] At least one internal link to another guide or to `/docs` / `/demo`.
- [ ] Closing CTA section present, with `<RelatedGuides />` just above it.
- [ ] Slug is keyword-rich, hyphenated, accent-free.
- [ ] `npm run validate:guides` passes with no errors.

---

## 7. What happens automatically (don't do these by hand)

- Listed on `/guias` (the index) and in the homepage "Guías" block.
- Added to `sitemap.xml` (with `lastModified` from `meta.updated`).
- Added to `/llms.txt` (title + summary).
- `<h1>`, the "Guía" eyebrow, the dateline, breadcrumbs, Article JSON-LD, and all
  canonical/OG metadata are generated from `meta`.
- The **"N min de lectura"** estimate is counted from your prose at build time
  (code blocks, tags and link targets don't count). There's no field to set.
- No hreflang/English alternate is emitted (guides are Spanish-only by design).

---

## 8. MDX gotchas

- The file is **MDX**, so `{` and `}` in prose are interpreted as JS. If you need
  a literal brace in text, wrap it: `{"{"}`. (Rare — usually avoid.)
- A literal `<` followed by a letter looks like a tag. Write "menor que" or use
  `&lt;` if needed. (`<` between spaces, like `a < b`, is fine.)
- Comments use `{/* ... */}`, not `<!-- -->`.
- Don't add `---` frontmatter — metadata goes in the `export const meta` block.
- Keep raw HTML out; use Markdown + the provided components.

---

## 9. Copy-paste template

```mdx
export const meta = {
  title: "",
  description: "",
  summary: "",
  keywords: ["", "", ""],
  categories: ["", ""],
  published: "YYYY-MM-DDTHH:MM:SS-03:00",
  updated: "YYYY-MM-DDTHH:MM:SS-03:00",
};

Párrafo de introducción con la palabra clave principal en la primera o segunda
oración.

## Primera sección

Texto.

## Segunda sección

Texto, con una tabla o lista si ayuda. Enlaza a una guía relacionada cuando
tenga sentido: [texto del enlace](/guias/otro-slug).

## Léelo automáticamente

Cierre que conecta el tema con Factura.

<RelatedGuides />

<CtaRow>
  <DemoCta />
  <SignupCta />
</CtaRow>
```

---

## 10. How to use this with Claude

Paste this entire file into the chat, then add something like:

> Write a guide following the spec above.
> Topic: **<your topic>**.
> Primary keyword: **<keyword>**.
> Audience / angle: <notes>.
> Length: <e.g. ~800–1200 words>.
> Interlink to: <existing slugs, if any>.
> Return only the final `.mdx` file contents, and suggest a slug/filename.

Then save the returned content as `src/content/guias/<slug>.mdx` and rebuild.

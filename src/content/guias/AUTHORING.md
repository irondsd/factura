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
  published: "2026-06-29",
  updated: "2026-06-29",
};
```

| Field         | Used for                                                       | Rules / length                                                       |
| ------------- | -------------------------------------------------------------- | -------------------------------------------------------------------- |
| `title`       | Browser `<title>`, the on-page `<h1>`, OG/Twitter, JSON-LD     | ~50–60 chars. Put the primary keyword near the front.                |
| `description` | `<meta name="description">`, OG/Twitter description            | ~150–160 chars. One compelling sentence; this is the search snippet. |
| `summary`     | The `/guias` index cards, the homepage list, `llms.txt`        | One short sentence (~90–120 chars). Can differ from `description`.   |
| `keywords`    | `<meta name="keywords">`                                       | 3–6 real Spanish search phrases. Lowercase.                          |
| `published`   | Article dateline, JSON-LD `datePublished`, sitemap             | `YYYY-MM-DD`. Set once, don't change.                                |
| `updated`     | Dateline (shown only if ≠ published), JSON-LD, sitemap lastmod | `YYYY-MM-DD`. Bump when you meaningfully edit.                       |

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

**Every guide should end** by tying the topic back to the product, e.g. a short
"Léelo automáticamente" section + a `<CtaRow>` with `<DemoCta />` and
`<SignupCta />`.

---

## 6. SEO checklist (apply before finishing)

- [ ] Primary keyword is in `title`, in the first paragraph, and in at least one `##`.
- [ ] `description` reads like a search result and is ~150–160 chars.
- [ ] 3–6 realistic `keywords`.
- [ ] At least one internal link to another guide or to `/docs` / `/demo`.
- [ ] Closing CTA section present.
- [ ] Slug is keyword-rich, hyphenated, accent-free.

---

## 7. What happens automatically (don't do these by hand)

- Listed on `/guias` (the index) and in the homepage "Guías" block.
- Added to `sitemap.xml` (with `lastModified` from `meta.updated`).
- Added to `/llms.txt` (title + summary).
- `<h1>`, the "Guía" eyebrow, the dateline, breadcrumbs, Article JSON-LD, and all
  canonical/OG metadata are generated from `meta`.
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
  published: "YYYY-MM-DD",
  updated: "YYYY-MM-DD",
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

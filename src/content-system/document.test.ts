import { describe, expect, it } from "vitest";
import { documentHeadings, documentStats, relatedDocuments } from "./document";
import type { ContentDocument, ContentSummary } from "./types";

const doc = (over: Partial<ContentDocument> = {}): ContentDocument => ({
  id: "1",
  section: "guias",
  slug: "una-guia",
  status: "published",
  title: "Una guía",
  titleTag: null,
  description: "d",
  summary: "s",
  cta: "c",
  canonicalSlug: null,
  parentId: null,
  sortOrder: 0,
  crumb: null,
  metadata: { keywords: [], categories: [] },
  body: "",
  publishedAt: "2026-01-01T00:00:00-03:00",
  contentUpdatedAt: "2026-01-01T00:00:00-03:00",
  createdAt: "2026-01-01T00:00:00-03:00",
  updatedAt: "2026-01-01T00:00:00-03:00",
  createdBy: null,
  updatedBy: null,
  lockVersion: 1,
  ...over,
});

describe("documentHeadings", () => {
  it("lists the ## sections with rehype-slug's ids", () => {
    // The ids have to match the rendered HTML exactly or every contents link
    // points at nothing.
    const headings = documentHeadings(
      doc({ body: "## Las secciones\n\ntexto\n\n## Cómo pagarla\n" }),
    );
    expect(headings).toEqual([
      { id: "las-secciones", text: "Las secciones" },
      { id: "cómo-pagarla", text: "Cómo pagarla" },
    ]);
  });

  it("appends the FAQ section when the body places it", () => {
    const headings = documentHeadings(
      doc({
        body: "## Uno\n\n<Faq />\n",
        metadata: { keywords: [], categories: [], faq: [{ q: "¿?", a: "." }] },
      }),
    );
    expect(headings.at(-1)).toEqual({
      id: "preguntas-frecuentes",
      text: "Preguntas frecuentes",
    });
  });

  it("does not append it when the body never places it", () => {
    // The contents would otherwise link to a section the page does not render.
    const headings = documentHeadings(
      doc({
        body: "## Uno\n",
        metadata: { keywords: [], categories: [], faq: [{ q: "¿?", a: "." }] },
      }),
    );
    expect(headings.map((h) => h.id)).toEqual(["uno"]);
  });

  it("does not append it when there are no questions", () => {
    expect(
      documentHeadings(doc({ body: "## Uno\n\n<Faq />\n" })).map((h) => h.id),
    ).toEqual(["uno"]);
  });

  it("appends the sources section when the body places it", () => {
    // Statistics and research pages end on `<Fuentes />`, whose heading lives
    // in metadata like the FAQ's. Missing here, it rendered on the page but
    // vanished from the contents column of every migrated section page.
    const headings = documentHeadings(
      doc({
        section: "estadisticas",
        body: "## Uno\n\n<Fuentes />\n",
        metadata: {
          keywords: [],
          categories: [],
          sources: [{ label: "INDEC", href: "https://indec.gob.ar" }],
        },
      }),
    );
    expect(headings.at(-1)).toEqual({ id: "fuentes", text: "Fuentes" });
  });

  it("does not append the sources section when there are no sources", () => {
    // `<Fuentes />` renders nothing for an empty list, so the entry would link
    // to a section that is not on the page.
    expect(
      documentHeadings(
        doc({ section: "estadisticas", body: "## Uno\n\n<Fuentes />\n" }),
      ).map((h) => h.id),
    ).toEqual(["uno"]);
  });

  it("lists both blocks in the order the page renders them", () => {
    const headings = documentHeadings(
      doc({
        section: "estadisticas",
        body: "## Uno\n\n<Faq />\n\n<Fuentes />\n",
        metadata: {
          keywords: [],
          categories: [],
          faq: [{ q: "¿?", a: "." }],
          sources: [{ label: "INDEC", href: "https://indec.gob.ar" }],
        },
      }),
    );
    expect(headings.map((h) => h.id)).toEqual([
      "uno",
      "preguntas-frecuentes",
      "fuentes",
    ]);
  });
});

describe("documentStats", () => {
  it("counts the FAQ, which renders but is not in the body", () => {
    const withoutFaq = documentStats(doc({ body: "una dos tres" }));
    const withFaq = documentStats(
      doc({
        body: "una dos tres",
        metadata: {
          keywords: [],
          categories: [],
          faq: [{ q: "cuatro cinco", a: "seis siete ocho" }],
        },
      }),
    );
    expect(withFaq.words).toBe(withoutFaq.words + 5);
  });

  it("never reports less than a minute", () => {
    expect(documentStats(doc({ body: "hola" })).minutes).toBe(1);
  });
});

describe("relatedDocuments", () => {
  const summary = (
    slug: string,
    categories: string[],
    published: string,
  ): ContentSummary => {
    // `relatedDocuments` ranks summaries, which are documents without a body.
    const { body, ...rest } = doc({
      id: slug,
      slug,
      metadata: { keywords: [], categories },
      publishedAt: published,
    });
    void body;
    return rest;
  };

  const current = summary(
    "actual",
    ["servicios", "facturas-y-conceptos"],
    "2026-01-01T00:00:00-03:00",
  );

  it("prefers pages sharing more categories", () => {
    const candidates = [
      summary("una", ["servicios"], "2026-01-01T00:00:00-03:00"),
      summary(
        "dos",
        ["servicios", "facturas-y-conceptos"],
        "2026-01-01T00:00:00-03:00",
      ),
    ];
    expect(relatedDocuments(current, candidates)[0].slug).toBe("dos");
  });

  it("breaks ties on publication date, newest first", () => {
    const candidates = [
      summary("vieja", ["servicios"], "2025-01-01T00:00:00-03:00"),
      summary("nueva", ["servicios"], "2026-06-01T00:00:00-03:00"),
    ];
    expect(relatedDocuments(current, candidates).map((c) => c.slug)).toEqual([
      "nueva",
      "vieja",
    ]);
  });

  it("tops up with unrelated pages so the block is never short", () => {
    // A page alone in its category would otherwise render an empty block where
    // the author placed <RelatedGuides />.
    const candidates = [
      summary("a", ["impuestos"], "2026-01-01T00:00:00-03:00"),
      summary("b", ["mercado-y-precios"], "2026-01-02T00:00:00-03:00"),
      summary("c", ["expensas"], "2026-01-03T00:00:00-03:00"),
    ];
    expect(relatedDocuments(current, candidates)).toHaveLength(3);
  });

  it("never suggests the page itself", () => {
    const candidates = [
      summary("actual", ["servicios"], "2026-01-01T00:00:00-03:00"),
      summary("otra", ["servicios"], "2026-01-01T00:00:00-03:00"),
    ];
    expect(relatedDocuments(current, candidates).map((c) => c.slug)).toEqual([
      "otra",
    ]);
  });

  it("suggests only what the caller passes", () => {
    // The lifecycle rule lives in the caller: a public page passes published
    // pages only, which is what keeps a draft out of a related block.
    expect(relatedDocuments(current, [])).toEqual([]);
  });
});

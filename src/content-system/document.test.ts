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
  metadata: { keywords: [], categories: [], locations: [] },
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
        metadata: {
          keywords: [],
          categories: [],
          locations: [],
          faq: [{ q: "¿?", a: "." }],
        },
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
        metadata: {
          keywords: [],
          categories: [],
          locations: [],
          faq: [{ q: "¿?", a: "." }],
        },
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
          locations: [],
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

  it("appends the methodology section when the body places it", () => {
    const headings = documentHeadings(
      doc({
        section: "estadisticas",
        body: "## Uno\n\n<Metodologia />\n",
        metadata: {
          keywords: [],
          categories: [],
          locations: [],
          methodology: { period: "2021–2024." },
        },
      }),
    );
    expect(headings.at(-1)).toEqual({ id: "metodologia", text: "Metodología" });
  });

  it("does not append the methodology section when none of its fields are filled", () => {
    // One field is enough to draw the block; none is a tag over nothing, and an
    // entry linking to a section that is not there is worse than no entry.
    expect(
      documentHeadings(
        doc({
          section: "estadisticas",
          body: "## Uno\n\n<Metodologia />\n",
          metadata: {
            keywords: [],
            categories: [],
            locations: [],
            methodology: { coverage: "  " },
          },
        }),
      ).map((h) => h.id),
    ).toEqual(["uno"]);
  });

  it("lists the three blocks in the order the page renders them", () => {
    const headings = documentHeadings(
      doc({
        section: "estadisticas",
        body: "## Uno\n\n<Metodologia />\n\n<Faq />\n\n<Fuentes />\n",
        metadata: {
          keywords: [],
          categories: [],
          locations: [],
          methodology: { sources: "INDEC." },
          faq: [{ q: "¿?", a: "." }],
          sources: [{ label: "INDEC", href: "https://indec.gob.ar" }],
        },
      }),
    );
    expect(headings.map((h) => h.id)).toEqual([
      "uno",
      "metodologia",
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
          locations: [],
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
    locations: string[] = ["mendoza"],
  ): ContentSummary => {
    // `relatedDocuments` ranks summaries, which are documents without a body.
    const { body, ...rest } = doc({
      id: slug,
      slug,
      metadata: { keywords: [], categories, locations },
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

  it("never lets a date decide a tie", () => {
    // Recency used to break ties, so every publish or edit moved the guide into
    // dozens of other rails, and each of those pages is a billed ISR write.
    const candidates = [
      summary("antes", ["servicios"], "2026-06-01T00:00:00-03:00"),
      summary("despues", ["servicios"], "2025-01-01T00:00:00-03:00"),
      summary("otra", ["servicios"], "2025-03-01T00:00:00-03:00"),
      summary("mas", ["servicios"], "2025-05-01T00:00:00-03:00"),
    ];
    const before = relatedDocuments(current, candidates).map((c) => c.slug);
    const touched = candidates.map((c) => ({
      ...c,
      publishedAt: "2026-09-01T00:00:00-03:00",
      contentUpdatedAt: "2026-09-01T00:00:00-03:00",
    }));
    expect(
      relatedDocuments(current, touched.reverse()).map((c) => c.slug),
    ).toEqual(before);
  });

  it("spreads a tied pool across pages instead of repeating one pick", () => {
    const pool = Array.from({ length: 30 }, (_, i) =>
      summary(`g${i}`, ["servicios"], "2026-01-01T00:00:00-03:00"),
    );
    const picks = new Set(
      pool.flatMap((page) => relatedDocuments(page, pool).map((c) => c.slug)),
    );
    expect(picks.size).toBeGreaterThan(15);
  });

  it("keeps to the page's own location before anything else", () => {
    // A Mendoza reader gets Mendoza guides, even ones in another category, ahead
    // of a better category match from a province they do not live in.
    const candidates = [
      summary("lejos", current.metadata.categories, "2026-01-01", ["salta"]),
      summary("nacional", current.metadata.categories, "2026-01-01", [
        "argentina",
      ]),
      summary("local-otro-tema", ["impuestos"], "2026-01-01"),
      summary("local", ["servicios"], "2026-01-01"),
    ];
    expect(relatedDocuments(current, candidates).map((c) => c.slug)).toEqual([
      "local",
      "local-otro-tema",
      "nacional",
    ]);
  });

  it("matches on any of the page's locations", () => {
    const amba = summary("amba", ["servicios"], "2026-01-01", [
      "caba",
      "gran-buenos-aires",
    ]);
    const candidates = [
      summary("gba", ["servicios"], "2026-01-01", ["gran-buenos-aires"]),
      summary("pba", ["servicios"], "2026-01-01", [
        "provincia-de-buenos-aires",
      ]),
    ];
    expect(relatedDocuments(amba, candidates).map((c) => c.slug)).toEqual([
      "gba",
    ]);
  });

  it("shows a short list rather than pages from other provinces", () => {
    // No neighbours and no unrelated filler: a short rail is fine, and with no
    // match at all <RelatedGuides /> renders nothing.
    const candidates = [
      summary("local", ["impuestos"], "2026-01-01"),
      summary("a", ["servicios"], "2026-01-01", ["salta"]),
      summary("b", ["servicios"], "2026-01-01", ["chaco"]),
    ];
    expect(relatedDocuments(current, candidates).map((c) => c.slug)).toEqual([
      "local",
    ]);
    expect(relatedDocuments(current, candidates.slice(1))).toEqual([]);
  });

  it("gives a nationwide page other nationwide pages", () => {
    const nacional = summary("nacional", ["servicios"], "2026-01-01", [
      "argentina",
    ]);
    const candidates = [
      summary("otra-nacional", ["expensas"], "2026-01-01", ["argentina"]),
      summary("provincial", ["servicios"], "2026-01-01"),
    ];
    expect(relatedDocuments(nacional, candidates).map((c) => c.slug)).toEqual(
      ["otra-nacional"],
    );
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

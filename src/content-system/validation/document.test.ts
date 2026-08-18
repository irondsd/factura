import { describe, expect, it } from "vitest";
import type { ContentDocument } from "../types";
import { buildContentIndex } from "./collection";
import { DOCUMENT_CODES, validateDocument } from "./document";

// Deterministic validator tests over in-memory documents (cms.md Phase 4). No
// filesystem, no database, no fixtures on disk — a rule and the document that
// breaks it, side by side.

const base: ContentDocument = {
  id: "1",
  section: "guias",
  slug: "como-leer-la-factura-de-edesur",
  status: "published",
  title: "Cómo leer la factura de Edesur: guía completa",
  titleTag: null,
  description:
    "Aprende a leer tu factura de Edesur: número de cliente, vencimiento, total a pagar y consumo en kWh, con un ejemplo para ubicar cada dato del resumen.",
  summary: "Qué significa cada sección de la factura de Edesur.",
  cta: "¿Tu factura de Edesur subió? Mira cuánto y por qué.",
  canonicalSlug: null,
  parentId: null,
  sortOrder: 0,
  crumb: null,
  metadata: {
    keywords: [
      "factura de edesur",
      "como leer factura edesur",
      "consumo edesur",
    ],
    categories: ["servicios", "leer-facturas"],
  },
  body: [
    "## Las secciones de la factura",
    "",
    "Texto con un [enlace](/guias/como-leer-la-factura-de-aysa).",
    "",
    "<RelatedGuides />",
    "",
    '<ClosingCta title="Tu factura, no el promedio">',
    "",
    "Dos frases de cierre.",
    "",
    "</ClosingCta>",
    "",
  ].join("\n"),
  publishedAt: "2026-07-12T09:00:00-03:00",
  contentUpdatedAt: "2026-08-09T11:30:00-03:00",
  createdAt: "2026-07-12T09:00:00-03:00",
  updatedAt: "2026-08-09T11:30:00-03:00",
  createdBy: null,
  updatedBy: null,
  lockVersion: 1,
};

const index = buildContentIndex([
  { slug: base.slug, status: "published" },
  { slug: "como-leer-la-factura-de-aysa", status: "published" },
  { slug: "borrador", status: "draft" },
]);

const check = (patch: Partial<ContentDocument> = {}) =>
  validateDocument({ ...base, ...patch }, index);

const codes = (patch: Partial<ContentDocument> = {}) =>
  check(patch).diagnostics.map((d) => d.code);

const meta = (extra: Record<string, unknown>) => ({
  metadata: { ...base.metadata, ...extra } as ContentDocument["metadata"],
});

describe("a well-formed guide", () => {
  it("produces no diagnostics at all", () => {
    expect(check().diagnostics).toEqual([]);
    expect(check().ok).toBe(true);
  });
});

describe("slug", () => {
  it("rejects accents and spaces", () => {
    expect(codes({ slug: "cómo leer" })).toContain(DOCUMENT_CODES.slugShape);
  });

  it("rejects a slug a route would shadow", () => {
    expect(codes({ slug: "categoria" })).toContain(DOCUMENT_CODES.slugReserved);
  });
});

describe("title", () => {
  it("errors past 60 characters", () => {
    expect(codes({ title: "x".repeat(61) })).toContain(
      DOCUMENT_CODES.titleTooLong,
    );
  });

  it("measures the titleTag when there is one", () => {
    // The rendered <title> is what gets cut off in a search result, and that is
    // the titleTag when set — so a long headline with a short tag is fine.
    expect(
      codes({ title: "x".repeat(80), titleTag: "Corto y claro" }),
    ).not.toContain(DOCUMENT_CODES.titleTooLong);
    expect(codes({ titleTag: "y".repeat(61) })).toContain(
      DOCUMENT_CODES.titleTooLong,
    );
  });

  it("warns when the titleTag is not actually shorter", () => {
    expect(codes({ titleTag: `${base.title} y más` })).toContain(
      DOCUMENT_CODES.titleTagNotShorter,
    );
  });
});

describe("canonical", () => {
  it("rejects pointing at itself", () => {
    expect(codes({ canonicalSlug: base.slug })).toContain(
      DOCUMENT_CODES.canonicalSelf,
    );
  });

  it("rejects an unknown target", () => {
    expect(codes({ canonicalSlug: "no-existe" })).toContain(
      DOCUMENT_CODES.canonicalUnknown,
    );
  });

  it("accepts another guide", () => {
    expect(codes({ canonicalSlug: "como-leer-la-factura-de-aysa" })).toEqual(
      [],
    );
  });
});

describe("keywords and categories", () => {
  it("requires keywords", () => {
    expect(codes(meta({ keywords: [] }))).toContain(
      DOCUMENT_CODES.metadataShape,
    );
  });

  it("warns outside 3–6 keywords", () => {
    expect(codes(meta({ keywords: ["uno", "dos"] }))).toContain(
      DOCUMENT_CODES.keywordCount,
    );
  });

  it("warns when the primary keyword is absent from title and description", () => {
    expect(
      codes(meta({ keywords: ["tarifa social de aysa", "b", "c"] })),
    ).toContain(DOCUMENT_CODES.keywordMissing);
  });

  it("matches a keyword across Spanish inflection", () => {
    // "aumentaron" in the copy should satisfy "aumento" in the keyword; without
    // stemming this warning fires on half the guides and gets ignored.
    const result = validateDocument(
      {
        ...base,
        title: "Cuánto aumentaron las expensas en 2026",
        description:
          "Las expensas aumentaron muy por encima de la inflación general este año, y este es el detalle mes a mes de cuánto subió cada rubro del edificio.",
        ...meta({
          keywords: ["aumento de expensas", "expensas 2026", "expensas"],
        }),
      },
      index,
    );
    expect(result.diagnostics.map((d) => d.code)).not.toContain(
      DOCUMENT_CODES.keywordMissing,
    );
  });

  it("rejects an unknown category id", () => {
    expect(codes(meta({ categories: ["inventada"] }))).toContain(
      DOCUMENT_CODES.categoryUnknown,
    );
  });

  it("rejects duplicate categories", () => {
    expect(codes(meta({ categories: ["servicios", "servicios"] }))).toContain(
      DOCUMENT_CODES.categoryUnknown,
    );
  });

  it("warns past three categories", () => {
    expect(
      codes(
        meta({
          categories: [
            "servicios",
            "leer-facturas",
            "ahorro-y-control",
            "impuestos",
          ],
        }),
      ),
    ).toContain(DOCUMENT_CODES.categoryCount);
  });
});

describe("faq", () => {
  const withFaq = (faq: unknown, body = base.body) => ({
    ...meta({ faq }),
    body,
  });

  it("requires the body to place <Faq /> when there are questions", () => {
    // FAQPage markup describing questions the visitor cannot see is exactly
    // what Google's spam guidance is aimed at.
    expect(
      codes(
        withFaq([
          { q: "¿Y?", a: "Pues." },
          { q: "¿Y2?", a: "Pues2." },
          { q: "¿Y3?", a: "Pues3." },
        ]),
      ),
    ).toContain(DOCUMENT_CODES.faqNotPlaced);
  });

  it("requires questions when the body places <Faq />", () => {
    expect(codes({ body: `${base.body}\n<Faq />\n` })).toContain(
      DOCUMENT_CODES.faqPlacedWithoutData,
    );
  });

  it("accepts the matched pair", () => {
    expect(
      codes(
        withFaq(
          [
            { q: "¿Uno?", a: "Sí." },
            { q: "¿Dos?", a: "También." },
            { q: "¿Tres?", a: "Claro." },
          ],
          `${base.body}\n<Faq />\n`,
        ),
      ),
    ).toEqual([]);
  });

  it("rejects markup inside an answer", () => {
    // One list feeds the visible block and the JSON-LD, so the two strings have
    // to be identical.
    expect(
      codes(
        withFaq(
          [
            { q: "¿Uno?", a: "Ver [la guía](/guias/x)." },
            { q: "¿Dos?", a: "b" },
            { q: "¿Tres?", a: "c" },
          ],
          `${base.body}\n<Faq />\n`,
        ),
      ),
    ).toContain(DOCUMENT_CODES.faqMarkup);
  });

  it("warns on a thin FAQ", () => {
    expect(
      codes(withFaq([{ q: "¿Uno?", a: "Sí." }], `${base.body}\n<Faq />\n`)),
    ).toContain(DOCUMENT_CODES.faqCount);
  });
});

describe("dates", () => {
  it("requires an explicit offset", () => {
    expect(codes({ publishedAt: "2026-07-12" })).toContain(
      DOCUMENT_CODES.dateFormat,
    );
  });

  it("rejects an update before publication", () => {
    expect(codes({ contentUpdatedAt: "2020-01-01T00:00:00-03:00" })).toContain(
      DOCUMENT_CODES.dateOrder,
    );
  });

  it("accepts a timestamp that has been through the database", () => {
    // `timestamptz` round-trips as "2026-07-12T12:00:00.000Z" — milliseconds,
    // and `Z` rather than the authored offset. Rejecting that made *every*
    // database-created page fail the date rule, which is how this was found.
    expect(
      codes({
        publishedAt: "2026-07-12T12:00:00.000Z",
        contentUpdatedAt: "2026-08-09T14:30:00.123Z",
      }),
    ).toEqual([]);
  });

  it("still requires an offset of some kind", () => {
    expect(codes({ contentUpdatedAt: "2026-08-09T14:30:00.123" })).toContain(
      DOCUMENT_CODES.dateFormat,
    );
  });

  it("accepts a draft that has never been published", () => {
    // `publishedAt` is null until the first publish; that is a normal state,
    // not a missing date.
    expect(codes({ status: "draft", publishedAt: null })).toEqual([]);
  });
});

describe("body", () => {
  it("rejects an H1, which the page already renders from the title", () => {
    expect(codes({ body: `# Título\n${base.body}` })).toContain(
      DOCUMENT_CODES.bodyH1,
    );
  });

  it("rejects a meta export left in the body", () => {
    expect(
      codes({ body: `export const meta = { title: "x" };\n${base.body}` }),
    ).toContain(DOCUMENT_CODES.bodyMetaExport);
  });

  it("rejects frontmatter", () => {
    expect(codes({ body: `---\ntitle: x\n---\n${base.body}` })).toContain(
      DOCUMENT_CODES.bodyFrontmatter,
    );
  });

  it("rejects a link to a guide that does not exist", () => {
    expect(
      codes({ body: `${base.body}\n[roto](/guias/no-existe)\n` }),
    ).toContain(DOCUMENT_CODES.linkBroken);
  });

  it("warns about a link to itself", () => {
    expect(
      codes({ body: `${base.body}\n[yo](/guias/${base.slug})\n` }),
    ).toContain(DOCUMENT_CODES.linkSelf);
  });

  it("warns about a link to an unpublished guide", () => {
    // The old validator's "links to a noindex guide", restated in lifecycle
    // terms: a link to a page no listing shows.
    expect(
      codes({ body: `${base.body}\n[borrador](/guias/borrador)\n` }),
    ).toContain(DOCUMENT_CODES.linkUnpublished);
  });

  it("warns when there are no section headings", () => {
    expect(
      codes({ body: "Sólo un párrafo.\n\n<RelatedGuides />\n" }),
    ).toContain(DOCUMENT_CODES.noHeadings);
  });

  it("warns about a missing or empty closing CTA", () => {
    expect(codes({ body: "## Uno\n\n<RelatedGuides />\n" })).toContain(
      DOCUMENT_CODES.noClosingCta,
    );
    expect(
      codes({ body: "## Uno\n\n<ClosingCta>\n\nCopia.\n\n</ClosingCta>\n" }),
    ).toContain(DOCUMENT_CODES.closingCtaNoTitle);
    expect(
      codes({ body: '## Uno\n\n<ClosingCta title="T">\n\n</ClosingCta>\n' }),
    ).toContain(DOCUMENT_CODES.closingCtaNoCopy);
  });

  it("warns when <RelatedGuides /> is missing", () => {
    expect(
      codes({
        body: '## Uno\n\n<ClosingCta title="T">\n\nC.\n\n</ClosingCta>\n',
      }),
    ).toContain(DOCUMENT_CODES.noRelatedGuides);
  });
});

describe("preview image", () => {
  it("is only checked when the caller can stat files", () => {
    // A database validator has no filesystem to check against, so the rule is a
    // capability the CLI supplies rather than something assumed.
    const doc = {
      ...base,
      ...meta({ previewImage: "/img/guias/previews/x.jpg" }),
    };
    expect(validateDocument(doc, index).diagnostics).toEqual([]);
    expect(
      validateDocument(doc, index, {
        assetExists: () => false,
      }).diagnostics.map((d) => d.code),
    ).toContain(DOCUMENT_CODES.previewMissingAsset);
  });
});

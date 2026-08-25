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
    categories: ["servicios", "facturas-y-conceptos"],
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

describe("statistics and research documents", () => {
  const dataPage = (): ContentDocument => ({
    ...base,
    id: "data-1",
    section: "estadisticas",
    slug: "alquiler-caba/barrios",
    title: "Alquileres por barrio en CABA",
    titleTag: null,
    description:
      "Precios de alquiler por barrio y comuna en la Ciudad de Buenos Aires.",
    summary: "Datos de alquileres por barrio.",
    cta: "Compará tus gastos.",
    metadata: {
      keywords: ["alquileres caba"],
      categories: ["alquileres"],
      sources: [
        {
          label: "IDECBA",
          href: "https://www.estadisticaciudad.gob.ar/",
        },
      ],
      dataset: {
        name: "Alquileres por barrio",
        description: "Precio de publicación mensual por barrio.",
        temporalCoverage: "2024-01/2026-06",
        spatialCoverage: "Ciudad Autónoma de Buenos Aires",
        variableMeasured: ["precio de alquiler"],
      },
    },
    body: "## Los datos\n\n<Fuentes />\n",
  });

  const codesOf = (document: ContentDocument) =>
    validateDocument(document).diagnostics.map((diagnostic) => diagnostic.code);

  it("accepts provenance and a dataset for a publishable data page", () => {
    expect(validateDocument(dataPage()).diagnostics).toEqual([]);
  });

  it("requires provenance from a page that places <Fuentes />, and a dataset always", () => {
    const document = dataPage();
    document.metadata = { keywords: [], categories: [] };
    const result = validateDocument(document);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(
      expect.arrayContaining([
        DOCUMENT_CODES.sourcesPlacedWithoutData,
        DOCUMENT_CODES.metadataShape,
      ]),
    );
    expect(
      result.diagnostics.find(
        (diagnostic) =>
          diagnostic.code === DOCUMENT_CODES.sourcesPlacedWithoutData,
      )?.severity,
    ).toBe("error");
  });

  it("treats an empty source list as no sources at all", () => {
    // `sources: []` used to parse cleanly and slip past the check, so a page
    // could publish an empty <Fuentes /> block.
    const document = dataPage();
    document.metadata = { ...document.metadata, sources: [] };
    expect(codesOf(document)).toContain(
      DOCUMENT_CODES.sourcesPlacedWithoutData,
    );
  });

  it("only advises about missing provenance when the body never places <Fuentes />", () => {
    const document = dataPage();
    document.metadata = { ...document.metadata, sources: [] };
    document.body = "## Los datos\n\nSin bloque de fuentes.\n";
    const missing = validateDocument(document).diagnostics.find(
      (diagnostic) => diagnostic.code === DOCUMENT_CODES.sourcesMissing,
    );
    expect(missing?.severity).toBe("warning");
    // An advisory does not stop the page: warnings never block publication.
    expect(validateDocument(document).ok).toBe(true);
  });

  it("advises when sources are typed but never placed", () => {
    const document = dataPage();
    document.body = "## Los datos\n\nSin bloque de fuentes.\n";
    const notPlaced = validateDocument(document).diagnostics.find(
      (diagnostic) => diagnostic.code === DOCUMENT_CODES.sourcesNotPlaced,
    );
    expect(notPlaced?.severity).toBe("warning");
  });

  it("accepts a dataset that names its own licence, and only as a URL", () => {
    // Absent on nearly every page — the site-wide licence covers them — so the
    // key has to stay optional, and a typo in the rare page that sets it has to
    // be caught rather than shipped into the markup.
    const licensed = dataPage();
    licensed.metadata = {
      ...licensed.metadata,
      dataset: {
        ...(licensed.metadata as { dataset: object }).dataset,
        license: "https://creativecommons.org/publicdomain/zero/1.0/",
      },
    } as ContentDocument["metadata"];
    expect(validateDocument(licensed).diagnostics).toEqual([]);

    const broken = dataPage();
    broken.metadata = {
      ...broken.metadata,
      dataset: {
        ...(broken.metadata as { dataset: object }).dataset,
        license: "CC BY 4.0",
      },
    } as ContentDocument["metadata"];
    expect(codesOf(broken)).toContain(DOCUMENT_CODES.metadataShape);
  });

  it("does not call valid Fuentes missing when only the dataset is incomplete", () => {
    const document = dataPage();
    document.metadata = {
      ...document.metadata,
      dataset: {},
    } as ContentDocument["metadata"];
    const diagnostics = validateDocument(document).diagnostics;
    expect(diagnostics.map((diagnostic) => diagnostic.code)).not.toContain(
      DOCUMENT_CODES.sourcesPlacedWithoutData,
    );
    expect(
      diagnostics.some((diagnostic) => diagnostic.field === "dataset.name"),
    ).toBe(true);
  });

  it("reports an empty FAQ list under a placed <Faq /> the same as no list", () => {
    const document = dataPage();
    document.body = `${document.body}\n<Faq />\n`;
    document.metadata = { ...document.metadata, faq: [] };
    expect(codesOf(document)).toContain(DOCUMENT_CODES.faqPlacedWithoutData);
  });

  it("keeps FAQ metadata and its visible placement in sync", () => {
    const document = dataPage();
    document.metadata = {
      ...document.metadata,
      faq: [{ q: "¿Cuándo se actualiza?", a: "Cada trimestre." }],
    };
    expect(validateDocument(document).diagnostics.map((d) => d.code)).toContain(
      DOCUMENT_CODES.faqNotPlaced,
    );
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
    const result = validateDocument(
      { ...base, ...meta({ categories: ["inventada"] }) },
      index,
      {
        categories: new Set([
          "servicios",
          "facturas-y-conceptos",
          "finanzas",
          "impuestos",
        ]),
      },
    );
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
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
            "facturas-y-conceptos",
            "finanzas",
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

describe("media references", () => {
  const ID = "8f2c1b7a-4d3e-4a1f-9c2b-0e5d6a7f8b90";
  const ready = new Map([[ID, { status: "ready", decorative: false }]]);

  /** The base guide with a different body, checked against a stated view of the
   * media library. */
  const withMedia = (
    body: string,
    media: Map<string, { status: string; decorative: boolean }> | undefined,
    patch: Partial<ContentDocument> = {},
  ) =>
    validateDocument(
      { ...base, ...patch, body: `${base.body}\n${body}\n` },
      index,
      media ? { media } : {},
    ).diagnostics.map((d) => d.code);

  it("accepts a library image with alt text", () => {
    const found = withMedia(`![Un medidor](/media/${ID}/medidor.jpg)`, ready);
    expect(found).not.toContain(DOCUMENT_CODES.mediaNoAlt);
    expect(found).not.toContain(DOCUMENT_CODES.mediaUnknown);
  });

  it("refuses an id the library does not have", () => {
    expect(
      withMedia(`![Un medidor](/media/${ID}/medidor.jpg)`, new Map()),
    ).toContain(DOCUMENT_CODES.mediaUnknown);
  });

  it("refuses an image that is in the trash", () => {
    expect(
      withMedia(
        `![Un medidor](/media/${ID}/medidor.jpg)`,
        new Map([[ID, { status: "trashed", decorative: false }]]),
      ),
    ).toContain(DOCUMENT_CODES.mediaNotReady);
  });

  it("refuses blank alt unless the library says the image is decorative", () => {
    expect(withMedia(`![](/media/${ID}/medidor.jpg)`, ready)).toContain(
      DOCUMENT_CODES.mediaNoAlt,
    );
    expect(
      withMedia(
        `![](/media/${ID}/medidor.jpg)`,
        new Map([[ID, { status: "ready", decorative: true }]]),
      ),
    ).not.toContain(DOCUMENT_CODES.mediaNoAlt);
  });

  it("does not demand alt text from a link that merely points at an image", () => {
    expect(
      withMedia(`[ver la factura](/media/${ID}/medidor.jpg)`, ready),
    ).not.toContain(DOCUMENT_CODES.mediaNoAlt);
  });

  it("refuses an image hotlinked from another site", () => {
    expect(withMedia("![Algo](https://example.com/foto.jpg)", ready)).toContain(
      DOCUMENT_CODES.mediaExternal,
    );
  });

  it("checks the preview id too", () => {
    expect(
      withMedia(
        "Sin imágenes en el cuerpo.",
        new Map([[ID, { status: "purged", decorative: false }]]),
        meta({ previewMediaId: ID }),
      ),
    ).toContain(DOCUMENT_CODES.mediaNotReady);
  });

  it("skips every media rule when the caller cannot resolve the library", () => {
    // Same contract as `assetExists`: a validator with no way to ask must not
    // invent an answer, and refusing every reference would be worse than
    // checking none.
    const found = withMedia(`![](/media/${ID}/medidor.jpg)`, undefined);
    expect(found).not.toContain(DOCUMENT_CODES.mediaNoAlt);
    expect(found).not.toContain(DOCUMENT_CODES.mediaUnknown);
  });
});

describe("author credits", () => {
  const ANA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const LUIS = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const known = new Set([ANA, LUIS]);

  const withCredits = (
    credits: Record<string, unknown>,
    authors: ReadonlySet<string> | undefined = known,
  ) =>
    validateDocument({ ...base, ...meta(credits) }, index, {
      ...(authors ? { authors } : {}),
    }).diagnostics;

  it("accepts a page credited to people who exist", () => {
    expect(
      withCredits({ authorId: ANA, factCheckerId: LUIS }).map((d) => d.code),
    ).toEqual([]);
  });

  it("rejects an id no author has", () => {
    const found = withCredits({
      authorId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    });
    expect(found.map((d) => d.code)).toContain(DOCUMENT_CODES.authorUnknown);
    // Named, so the editor's cursor can land on the right control.
    expect(found[0].field).toBe("authorId");
  });

  it("checks the fact checker the same way as the author", () => {
    expect(
      withCredits({
        factCheckerId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      }).map((d) => d.field),
    ).toContain("factCheckerId");
  });

  it("warns, but does not refuse, when one person does both jobs", () => {
    const found = withCredits({ authorId: ANA, factCheckerId: ANA });
    const selfCheck = found.find(
      (d) => d.code === DOCUMENT_CODES.authorSelfCheck,
    );
    expect(selfCheck?.severity).toBe("warning");
    expect(
      validateDocument(
        { ...base, ...meta({ authorId: ANA, factCheckerId: ANA }) },
        index,
        {
          authors: known,
        },
      ).ok,
    ).toBe(true);
  });

  it("still compares the two ids when the caller cannot resolve the list", () => {
    // Same contract as the media rules: no way to ask means no existence
    // check. Comparing two ids to each other needs no lookup, so that rule
    // keeps working.
    const found = withCredits({ authorId: ANA, factCheckerId: ANA }, undefined);
    expect(found.map((d) => d.code)).toEqual([DOCUMENT_CODES.authorSelfCheck]);
  });

  it("says nothing about a page that credits nobody", () => {
    expect(withCredits({}).map((d) => d.code)).toEqual([]);
  });
});

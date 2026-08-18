import { describe, expect, it } from "vitest";
import {
  contentDateTime,
  guideMetadataSchema,
  guideSlug,
  ogImageSchema,
} from "./guias";

const valid = {
  keywords: ["factura de edesur", "consumo edesur kwh"],
  categories: ["servicios", "leer-facturas"],
};

describe("guideSlug", () => {
  it("accepts a normal guide slug", () => {
    expect(guideSlug.safeParse("como-leer-la-factura-de-edesur").success).toBe(
      true,
    );
  });

  it("rejects accents, spaces and capitals", () => {
    for (const bad of ["cómo-leer", "como leer", "Como-Leer", "-leading"]) {
      expect(guideSlug.safeParse(bad).success).toBe(false);
    }
  });

  it("rejects a slug that a real route would shadow", () => {
    // /guias/categoria/[categoria] is a route. A guide with that slug would
    // never render, which is a mistake worth catching at creation rather than
    // at the first 404.
    expect(guideSlug.safeParse("categoria").success).toBe(false);
  });
});

describe("contentDateTime", () => {
  it("requires an explicit offset", () => {
    expect(contentDateTime.safeParse("2026-07-12T09:00:00-03:00").success).toBe(
      true,
    );
    expect(contentDateTime.safeParse("2026-07-12T09:00:00Z").success).toBe(
      true,
    );
    // Without one, the rendered dateline and the JSON-LD can disagree depending
    // on where the process runs — which is exactly what Google checks.
    expect(contentDateTime.safeParse("2026-07-12T09:00:00").success).toBe(
      false,
    );
    expect(contentDateTime.safeParse("2026-07-12").success).toBe(false);
  });

  it("accepts the millisecond form a timestamptz column returns", () => {
    expect(contentDateTime.safeParse("2026-07-12T12:00:00.000Z").success).toBe(
      true,
    );
  });

  it("rejects a date the calendar does not have", () => {
    expect(contentDateTime.safeParse("2026-02-30T09:00:00-03:00").success).toBe(
      false,
    );
  });
});

describe("guideMetadataSchema", () => {
  it("accepts the minimum a guide needs", () => {
    expect(guideMetadataSchema.safeParse(valid).success).toBe(true);
  });

  it("stores an incomplete draft without complaint", () => {
    // Shape, not completeness. A page created a second ago has no keywords yet,
    // and rejecting it here would make the row unreadable rather than
    // unfinished. `validateDocument` is what requires them, at preview and
    // publish level — see `document.test.ts`.
    expect(
      guideMetadataSchema.safeParse({ keywords: [], categories: [] }).success,
    ).toBe(true);
    expect(guideMetadataSchema.safeParse({}).success).toBe(true);
  });

  it("rejects an unknown category id", () => {
    expect(
      guideMetadataSchema.safeParse({ ...valid, categories: ["inventada"] })
        .success,
    ).toBe(false);
  });

  it("rejects duplicate categories", () => {
    // The first category is the primary one and decides the breadcrumb and the
    // index grouping; a duplicate makes "the first" ambiguous to a reader of
    // the form even though the code picks index 0.
    expect(
      guideMetadataSchema.safeParse({
        ...valid,
        categories: ["servicios", "servicios"],
      }).success,
    ).toBe(false);
  });

  it("rejects an unknown key", () => {
    // A renamed field that still validates is a field nothing reads.
    expect(
      guideMetadataSchema.safeParse({ ...valid, publicado: "sí" }).success,
    ).toBe(false);
  });

  it("rejects a blank optional override", () => {
    // `ogTitle: ""` would silently keep shipping the default it was written to
    // replace.
    expect(
      guideMetadataSchema.safeParse({ ...valid, ogTitle: "" }).success,
    ).toBe(false);
    expect(
      guideMetadataSchema.safeParse({ ...valid, ogTitle: "   " }).success,
    ).toBe(false);
  });

  it("accepts a complete FAQ and rejects an empty one", () => {
    expect(
      guideMetadataSchema.safeParse({
        ...valid,
        faq: [{ q: "¿Y esto?", a: "Esto." }],
      }).success,
    ).toBe(true);
    // `faq: []` would put an empty FAQPage block in the structured data.
    expect(guideMetadataSchema.safeParse({ ...valid, faq: [] }).success).toBe(
      false,
    );
  });

  it("constrains the preview image to the guides' own directory", () => {
    expect(
      guideMetadataSchema.safeParse({
        ...valid,
        previewImage: "/img/guias/previews/como-leer-la-factura-de-edesur.jpg",
      }).success,
    ).toBe(true);
    expect(
      guideMetadataSchema.safeParse({
        ...valid,
        previewImage: "https://example.com/foto.jpg",
      }).success,
    ).toBe(false);
  });
});

describe("ogImageSchema", () => {
  it("takes the two text slots and nothing else", () => {
    expect(
      ogImageSchema.safeParse({ eyebrow: "Inflación · Gas", stat: "×9" })
        .success,
    ).toBe(true);
    // It steers the generated card's copy; it is not an image URL, and a `url`
    // key here would be silently ignored at render time.
    expect(ogImageSchema.safeParse({ url: "/foto.png" }).success).toBe(false);
  });
});

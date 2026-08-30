import { describe, expect, it } from "vitest";
import { CONTENT_SECTIONS } from "../types";
import { metadataSchemaFor, parseMetadata } from "./schema";

const additiveMetadata = {
  keywords: ["alquiler caba"],
  categories: ["mercado-y-precios"],
  vendor: "Proveedor opcional",
  ogImage: { eyebrow: "Dato", stat: "+12%" },
  ogStat: "+12%",
  dataset: {
    name: "Alquileres",
    description: "Precios de oferta",
    temporalCoverage: "2025–2026",
    spatialCoverage: "CABA",
    variableMeasured: ["alquiler mensual"],
  },
};

describe("shared content metadata", () => {
  it("defaults legacy metadata to an empty location list", () => {
    const parsed = parseMetadata("guias", {
      keywords: [],
      categories: [],
    });
    expect(parsed).toEqual({
      ok: true,
      data: { keywords: [], categories: [], locations: [] },
    });
  });

  it("rejects duplicate locations and canonicalizes storage order", () => {
    expect(
      parseMetadata("guias", {
        keywords: [],
        categories: [],
        locations: ["caba", "caba"],
      }).ok,
    ).toBe(false);
    expect(
      parseMetadata("guias", {
        keywords: [],
        categories: [],
        locations: ["mendoza", "caba"],
      }),
    ).toEqual({
      ok: true,
      data: {
        keywords: [],
        categories: [],
        locations: ["caba", "mendoza"],
      },
    });
  });

  it("uses one additive schema for every section", () => {
    for (const section of CONTENT_SECTIONS) {
      expect(
        metadataSchemaFor(section).safeParse(additiveMetadata).success,
      ).toBe(true);
    }
  });

  it("still rejects unknown keys consistently", () => {
    for (const section of CONTENT_SECTIONS) {
      expect(
        parseMetadata(section, { ...additiveMetadata, misspelled: true }).ok,
      ).toBe(false);
    }
  });
});

describe("URLs stored in metadata", () => {
  // Metadata is rendered into `<a href>` by `<Fuentes />` exactly the way the
  // body is, so it is held to the same allowlist. It used to be `z.url()`,
  // which accepts anything `new URL()` parses — and `javascript:alert(1)`
  // parses.
  const withSource = (href: string) => ({
    keywords: [],
    categories: [],
    locations: [],
    sources: [{ label: "Fuente", href }],
  });

  it("accepts a real source link", () => {
    expect(
      parseMetadata("guias", withSource("https://www.enargas.gob.ar/")).ok,
    ).toBe(true);
  });

  it("refuses a javascript: source link", () => {
    const result = parseMetadata("guias", withSource("javascript:alert(1)"));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.problems[0].field).toBe("sources.0.href");
      expect(result.problems.map((p) => p.message).join(" ")).toContain(
        "javascript:",
      );
    }
  });

  it("refuses a data: source link", () => {
    expect(
      parseMetadata("guias", withSource("data:text/html,<script>x</script>"))
        .ok,
    ).toBe(false);
  });

  it("holds a dataset licence URL to the same rule", () => {
    const dataset = {
      name: "n",
      description: "d",
      temporalCoverage: "t",
      spatialCoverage: "s",
      variableMeasured: ["v"],
    };
    const base = { keywords: [], categories: [], locations: [] };
    expect(
      parseMetadata("estadisticas", {
        ...base,
        dataset: {
          ...dataset,
          license: "https://creativecommons.org/licenses/by/4.0/",
        },
      }).ok,
    ).toBe(true);
    expect(
      parseMetadata("estadisticas", {
        ...base,
        dataset: { ...dataset, license: "javascript:alert(1)" },
      }).ok,
    ).toBe(false);
  });

  it("still refuses a href that is not a URL at all", () => {
    // The allowlist narrowed `z.url()`; it must not have replaced it. A bare
    // path in `sources` is a mistake — a citation points somewhere a reader
    // can go from anywhere.
    expect(parseMetadata("guias", withSource("/guias/edesur")).ok).toBe(false);
  });
});

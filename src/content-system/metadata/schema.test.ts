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

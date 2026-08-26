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

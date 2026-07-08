import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ENGINE_CONFIGS } from "@/parsers/engine/configs";
import { edesurConfig } from "@/parsers/engine/configs/edesur";
import { runConfig } from "@/parsers/engine/evaluate";
import { normalize } from "@/parsers/normalize";
import { fieldsOf, rowToConfig } from "./parsers";

/** Each preset, the way seedParserConfigs stores it: metadata in columns, the
 * rest as a JSON-serialized `body`. */
function asStoredRow(config: (typeof ENGINE_CONFIGS)[number]) {
  const { slug, version, vendor, ...body } = config;
  return {
    id: "00000000-0000-0000-0000-000000000000",
    ownerId: null,
    slug,
    version,
    vendorSlug: vendor.slug,
    displayName: vendor.displayName,
    // Round-trip through JSON to mimic the jsonb column exactly.
    body: JSON.parse(JSON.stringify(body)),
    tier: "official" as const,
    category: null,
    region: null,
    provider: null,
    compat: null,
    forkedFrom: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function fixture(name: string): string {
  return normalize(
    readFileSync(
      join(__dirname, "..", "parsers", "__fixtures__", `${name}.txt`),
      "utf8",
    ),
  );
}

const SAMPLES: Record<string, string> = {
  edesur: "edesur",
  metrogas: "metrogas",
  telecom: "telecom",
  "mda-expensas": "mda-expensas",
  "dominijanni-expensas": "dominijanni-expensas",
};

describe("DB round-trip (rowToConfig)", () => {
  for (const config of ENGINE_CONFIGS) {
    it(`reproduces ${config.slug} after storage`, () => {
      const restored = rowToConfig(asStoredRow(config));
      const text = fixture(SAMPLES[config.slug]);
      // Stored-then-restored config parses identically to the in-memory one.
      expect(runConfig(restored, text)).toEqual(runConfig(config, text));
    });

    it(`restores metadata for ${config.slug}`, () => {
      const restored = rowToConfig(asStoredRow(config));
      expect(restored.slug).toBe(config.slug);
      expect(restored.version).toBe(config.version);
      expect(restored.vendor).toEqual(config.vendor);
    });
  }
});

describe("fieldsOf", () => {
  it("always lists the four semantic roles plus custom fields by name", () => {
    expect(fieldsOf(edesurConfig)).toEqual([
      "amount",
      "period",
      "dueDate",
      "accountNumber",
      "consumption",
      "lateSurcharge",
    ]);
  });

  it("lists just the roles when there are no custom fields", () => {
    const bare = { ...edesurConfig, custom: undefined };
    expect(fieldsOf(bare)).toEqual([
      "amount",
      "period",
      "dueDate",
      "accountNumber",
    ]);
  });
});

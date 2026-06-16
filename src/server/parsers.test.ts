import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ENGINE_CONFIGS } from "@/parsers/engine/configs";
import { runConfig } from "@/parsers/engine/evaluate";
import { normalize } from "@/parsers/normalize";
import { rowToConfig } from "./parsers";

/** Each preset, the way seedParserConfigs stores it: metadata in columns, the
 * rest as a JSON-serialized `body`. */
function asStoredRow(config: (typeof ENGINE_CONFIGS)[number]) {
  const { slug, version, vendor, ...body } = config;
  return {
    id: "00000000-0000-0000-0000-000000000000",
    slug,
    version,
    vendorSlug: vendor.slug,
    displayName: vendor.displayName,
    category: vendor.category as never,
    // Round-trip through JSON to mimic the jsonb column exactly.
    body: JSON.parse(JSON.stringify(body)),
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function fixture(name: string): string {
  return normalize(
    readFileSync(join(__dirname, "..", "parsers", "__fixtures__", `${name}.txt`), "utf8"),
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

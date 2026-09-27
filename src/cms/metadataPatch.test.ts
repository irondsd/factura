import { describe, expect, it } from "vitest";
import { applyMetadataPatch } from "./metadataPatch";

describe("applyMetadataPatch", () => {
  const stored = {
    keywords: ["luz"],
    faq: [{ q: "¿Uno?", a: "Sí." }],
    vendor: "Edesur",
  };

  it("sets the keys it names and keeps the rest", () => {
    expect(applyMetadataPatch(stored, { keywords: ["gas"] })).toEqual({
      ...stored,
      keywords: ["gas"],
    });
  });

  it("removes a key set to null", () => {
    expect(applyMetadataPatch(stored, { vendor: null })).not.toHaveProperty(
      "vendor",
    );
  });

  it("replaces a list whole rather than merging into it", () => {
    expect(
      applyMetadataPatch(stored, { faq: [{ q: "¿Dos?", a: "No." }] }).faq,
    ).toEqual([{ q: "¿Dos?", a: "No." }]);
  });

  it("leaves the stored object untouched", () => {
    applyMetadataPatch(stored, { vendor: null });
    expect(stored.vendor).toBe("Edesur");
  });

  it("starts from nothing when nothing sensible is stored", () => {
    expect(applyMetadataPatch(null, { vendor: "AySA" })).toEqual({
      vendor: "AySA",
    });
  });
});

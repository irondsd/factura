import { describe, expect, it } from "vitest";
import { isLocationSlug, slugifyLocation } from "./slug";

describe("location slugs", () => {
  it("folds accents and spaces", () => {
    expect(slugifyLocation("  Provincia de Córdoba ")).toBe(
      "provincia-de-cordoba",
    );
  });

  it("accepts only one safe URL segment", () => {
    expect(isLocationSlug("gran-buenos-aires")).toBe(true);
    expect(isLocationSlug("Gran Buenos Aires")).toBe(false);
    expect(isLocationSlug("caba/barrios")).toBe(false);
  });
});

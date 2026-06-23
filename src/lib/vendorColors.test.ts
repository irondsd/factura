import { describe, expect, it } from "vitest";
import {
  DEFAULT_VENDOR_COLOR,
  VENDOR_COLOR_NAMES,
  isVendorColorName,
  pickVendorColor,
  vendorColorClass,
  vendorColorVar,
} from "./vendorColors";

describe("isVendorColorName", () => {
  it("accepts known names", () => {
    expect(isVendorColorName("burnt-orange")).toBe(true);
    expect(isVendorColorName(DEFAULT_VENDOR_COLOR)).toBe(true);
  });

  it("rejects unknown / nullish values", () => {
    expect(isVendorColorName("neon-pink")).toBe(false);
    expect(isVendorColorName(null)).toBe(false);
    expect(isVendorColorName(undefined)).toBe(false);
  });
});

describe("vendorColorVar", () => {
  it("maps a known name to its CSS variable", () => {
    expect(vendorColorVar("sage")).toBe("var(--vendor-sage)");
  });

  it("falls back to the muted ink for unknown/missing names", () => {
    expect(vendorColorVar("nope")).toBe("var(--muted)");
    expect(vendorColorVar(null)).toBe("var(--muted)");
  });
});

describe("vendorColorClass", () => {
  it("maps a known name to its background utility class", () => {
    expect(vendorColorClass("rust")).toBe("vbg-rust");
  });

  it("falls back to the fallback class for unknown/missing names", () => {
    expect(vendorColorClass("nope")).toBe("vbg-fallback");
    expect(vendorColorClass(undefined)).toBe("vbg-fallback");
  });
});

describe("pickVendorColor", () => {
  it("always returns a valid palette name", () => {
    expect(VENDOR_COLOR_NAMES).toContain(pickVendorColor());
  });

  it("prefers a name not already in use", () => {
    const used = VENDOR_COLOR_NAMES.slice(0, -1); // all but the last
    const last = VENDOR_COLOR_NAMES[VENDOR_COLOR_NAMES.length - 1];
    // Only one free color remains, so it must be picked deterministically.
    expect(pickVendorColor(used)).toBe(last);
  });

  it("falls back to the full palette once every color is taken", () => {
    const picked = pickVendorColor(VENDOR_COLOR_NAMES);
    expect(VENDOR_COLOR_NAMES).toContain(picked);
  });

  it("accepts any iterable of used names", () => {
    const used = new Set(VENDOR_COLOR_NAMES.slice(0, -1));
    expect(pickVendorColor(used)).toBe(
      VENDOR_COLOR_NAMES[VENDOR_COLOR_NAMES.length - 1],
    );
  });
});

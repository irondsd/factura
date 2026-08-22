import { describe, expect, it } from "vitest";
import { dataLicense, licenseName } from "./urls";

// The sources block prints a licence by name, so a page that overrides the
// site-wide default has to resolve to one. The pages that do override are the
// ones built on INDEC series, which are ShareAlike.

describe("licenseName", () => {
  it("names the licences these pages cite", () => {
    expect(licenseName(dataLicense.url)).toBe(dataLicense.name);
    expect(licenseName("https://creativecommons.org/licenses/by-sa/4.0/")).toBe(
      "CC BY-SA 4.0",
    );
  });

  it("tolerates how a Creative Commons URL gets written down", () => {
    // INDEC's own footer links the localised deed, and a trailing slash is
    // dropped as often as it is kept.
    expect(licenseName("https://creativecommons.org/licenses/by-sa/4.0")).toBe(
      "CC BY-SA 4.0",
    );
    expect(
      licenseName("https://creativecommons.org/licenses/by-sa/4.0/deed.es"),
    ).toBe("CC BY-SA 4.0");
  });

  it("returns nothing for a licence it has not read", () => {
    // The block then renders a plain link. Guessing a short label for an
    // unknown licence would put words in someone else's mouth.
    expect(licenseName("https://example.org/terminos")).toBeUndefined();
  });
});

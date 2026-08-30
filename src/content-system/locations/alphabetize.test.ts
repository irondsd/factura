import { describe, expect, it } from "vitest";
import {
  alphabetizeLocations,
  contentHasLocation,
  groupLocationsByInitial,
  sortLocationContentByPublication,
} from "./alphabetize";

describe("location alphabetization", () => {
  it("sorts Spanish labels alphabetically without mutating the input", () => {
    const input = [
      { label: "Córdoba" },
      { label: "Argentina" },
      { label: "Buenos Aires" },
    ];

    expect(alphabetizeLocations(input).map(({ label }) => label)).toEqual([
      "Argentina",
      "Buenos Aires",
      "Córdoba",
    ]);
    expect(input[0]?.label).toBe("Córdoba");
  });

  it("groups accented initials under their base letter and omits no entries", () => {
    expect(
      groupLocationsByInitial([
        { label: "Ésteros" },
        { label: "Entre Ríos" },
        { label: "CABA" },
      ]),
    ).toEqual([
      { letter: "C", locations: [{ label: "CABA" }] },
      {
        letter: "E",
        locations: [{ label: "Entre Ríos" }, { label: "Ésteros" }],
      },
    ]);
  });

  it("sorts hub content by publication date rather than update date", () => {
    expect(
      sortLocationContentByPublication([
        { slug: "old", publishedAt: "2025-01-01T00:00:00.000Z" },
        { slug: "new", publishedAt: "2026-01-01T00:00:00.000Z" },
        { slug: "unpublished", publishedAt: null },
      ]).map(({ slug }) => slug),
    ).toEqual(["new", "old", "unpublished"]);
  });

  it("treats a pre-location cached summary as having no locations", () => {
    expect(contentHasLocation({ metadata: {} }, "caba")).toBe(false);
    expect(
      contentHasLocation({ metadata: { locations: ["caba"] } }, "caba"),
    ).toBe(true);
  });
});

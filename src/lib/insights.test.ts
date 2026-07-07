import { describe, expect, it } from "vitest";
import {
  activeRangeChip,
  defaultWindow,
  MAX_RANGE_MONTHS,
  monthRange,
  monthsBetween,
  presetForWindow,
  resolveWindowMonths,
  toSlices,
} from "./insights";

describe("monthsBetween", () => {
  it("counts whole months as to − from", () => {
    expect(monthsBetween("2026-01", "2026-04")).toBe(3);
  });

  it("spans year boundaries", () => {
    expect(monthsBetween("2025-11", "2026-02")).toBe(3);
  });

  it("is zero for the same month and negative when reversed", () => {
    expect(monthsBetween("2026-05", "2026-05")).toBe(0);
    expect(monthsBetween("2026-05", "2026-02")).toBe(-3);
  });
});

describe("monthRange", () => {
  it("is inclusive of both endpoints, oldest → newest", () => {
    expect(monthRange("2026-01", "2026-03")).toEqual([
      "2026-01",
      "2026-02",
      "2026-03",
    ]);
  });

  it("spans year boundaries", () => {
    expect(monthRange("2025-12", "2026-02")).toEqual([
      "2025-12",
      "2026-01",
      "2026-02",
    ]);
  });

  it("returns a single month when the endpoints match", () => {
    expect(monthRange("2026-06", "2026-06")).toEqual(["2026-06"]);
  });

  it("swaps reversed endpoints rather than returning empty", () => {
    expect(monthRange("2026-03", "2026-01")).toEqual([
      "2026-01",
      "2026-02",
      "2026-03",
    ]);
  });
});

describe("defaultWindow", () => {
  it("is the 12 months ending at the current month", () => {
    const w = defaultWindow();
    expect(monthsBetween(w.from, w.to)).toBe(11);
  });
});

describe("resolveWindowMonths", () => {
  const NOW = "2026-07";

  it("defaults to the last 12 months when no endpoints are given", () => {
    const months = resolveWindowMonths(undefined, undefined, NOW);
    expect(months).toHaveLength(12);
    expect(months[0]).toBe("2025-08");
    expect(months.at(-1)).toBe(NOW);
  });

  it("honours an explicit in-range window inclusively", () => {
    expect(resolveWindowMonths("2026-01", "2026-03", NOW)).toEqual([
      "2026-01",
      "2026-02",
      "2026-03",
    ]);
  });

  it("clamps `to` to the current month (never looks into the future)", () => {
    const months = resolveWindowMonths("2026-05", "2099-01", NOW);
    expect(months.at(-1)).toBe(NOW);
    expect(months[0]).toBe("2026-05");
  });

  it("defaults a missing `from` to 12 months back from `to`", () => {
    const months = resolveWindowMonths(undefined, "2026-03", NOW);
    expect(months).toHaveLength(12);
    expect(months.at(-1)).toBe("2026-03");
    expect(months[0]).toBe("2025-04");
  });

  it("collapses a reversed window to the single `to` month", () => {
    expect(resolveWindowMonths("2026-06", "2026-02", NOW)).toEqual(["2026-02"]);
  });

  it("caps the length at `max`, keeping the most recent months", () => {
    const months = resolveWindowMonths("1900-01", "2026-07", NOW, 6);
    expect(months).toHaveLength(6);
    expect(months.at(-1)).toBe(NOW);
    expect(months[0]).toBe("2026-02");
  });

  it("defaults the cap well beyond any real history", () => {
    expect(MAX_RANGE_MONTHS).toBeGreaterThanOrEqual(120);
  });
});

describe("presetForWindow", () => {
  const N = 25; // a 25-month span, indices 0..24

  it("matches a preset only when the window ends at the newest month", () => {
    expect(presetForWindow(13, 24, N)).toBe("12"); // last 12
    expect(presetForWindow(19, 24, N)).toBe("6"); // last 6
    expect(presetForWindow(1, 24, N)).toBe("24"); // last 24
  });

  it("returns null when the window doesn't touch the newest month", () => {
    expect(presetForWindow(13, 20, N)).toBeNull();
  });

  it("returns null for an arbitrary (non-preset) window", () => {
    expect(presetForWindow(5, 24, N)).toBeNull();
  });

  it("returns null for a full span longer than every preset", () => {
    expect(presetForWindow(0, 24, N)).toBeNull();
  });

  it("clamps a preset to the span when data is shorter than its count", () => {
    // 8-month span: a "12 mo" preset can only reach back to index 0.
    expect(presetForWindow(0, 7, 8)).toBe("12");
  });
});

describe("activeRangeChip", () => {
  const N = 25;

  it("is CUSTOM whenever the panel is open, regardless of window", () => {
    expect(activeRangeChip(13, 24, N, true)).toBe("custom");
    expect(activeRangeChip(0, 24, N, true)).toBe("custom");
  });

  it("is ALL when the window covers the whole span", () => {
    expect(activeRangeChip(0, 24, N, false)).toBe("all");
  });

  it("lights the matched preset for a preset-shaped window", () => {
    expect(activeRangeChip(13, 24, N, false)).toBe("12");
    expect(activeRangeChip(19, 24, N, false)).toBe("6");
  });

  it("falls back to CUSTOM for an arbitrary window", () => {
    expect(activeRangeChip(5, 20, N, false)).toBe("custom");
  });

  it("lets ALL win over a coinciding preset when data is scarce", () => {
    // 8-month span where a "12 mo" preset and "All" pick the same window.
    expect(activeRangeChip(0, 7, 8, false)).toBe("all");
  });
});

describe("toSlices", () => {
  const vendors = [
    { id: "a", displayName: "Alpha", color: "var(--a)" },
    { id: "b", displayName: "Beta", color: "var(--b)" },
  ];

  it("resolves each share entry to its vendor's name and color", () => {
    expect(toSlices([{ vendorId: "b", value: 40 }], vendors)).toEqual([
      { id: "b", label: "Beta", value: 40, color: "var(--b)" },
    ]);
  });

  it("falls back for an unknown vendor id", () => {
    expect(toSlices([{ vendorId: "zzz", value: 5 }], vendors)).toEqual([
      { id: "zzz", label: "—", value: 5, color: "var(--muted)" },
    ]);
  });
});

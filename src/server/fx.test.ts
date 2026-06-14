import { describe, expect, it } from "vitest";
import { pickRate } from "./fx";

const rates = [
  { date: "2026-06-08", venta: "1445" },
  { date: "2026-06-09", venta: "1460" },
  { date: "2026-06-10", venta: "1450" },
];

describe("pickRate", () => {
  it("returns the exact day's rate when present", () => {
    expect(pickRate(rates, "2026-06-09")).toBe(1460);
  });

  it("falls back to the most recent earlier day (market gaps)", () => {
    expect(pickRate(rates, "2026-06-12")).toBe(1450);
  });

  it("returns null for dates before all known rates", () => {
    expect(pickRate(rates, "2026-06-01")).toBeNull();
  });
});

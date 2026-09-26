import { describe, expect, it } from "vitest";
import { cellFills, formatReviewDate } from "./Opiniones";

describe("Opiniones", () => {
  it("fills five cells from a score out of 5", () => {
    expect(cellFills(3.4).map(Math.round)).toEqual([100, 100, 100, 40, 0]);
    expect(cellFills(0)).toEqual([0, 0, 0, 0, 0]);
    expect(cellFills(5)).toEqual([100, 100, 100, 100, 100]);
  });

  it("prints the collection date short", () => {
    expect(formatReviewDate("2026-09-26")).toBe("26 sept 2026");
    expect(formatReviewDate("no es fecha")).toBe("no es fecha");
  });
});

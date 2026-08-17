import { describe, expect, it } from "vitest";
import {
  elasticity,
  LAST_PERIOD,
  ranked,
  rows,
  SIZE_IDS,
} from "./rentabilidad-caba";

describe("rentabilidad-caba derived dataset", () => {
  it("keeps joined fields and yield nullability aligned", () => {
    for (const size of SIZE_IDS) {
      const data = rows("barrios", size, LAST_PERIOD);
      expect(new Set(data.map((row) => row.id)).size).toBe(data.length);
      for (const row of data) {
        expect(row.value === null).toBe(
          row.price === null || row.rentArs === null,
        );
        if (row.value !== null) expect(row.value).toBeGreaterThan(0);
      }
    }
  });

  it("ranks only complete rows in descending yield order", () => {
    const order = ranked("barrios", "amb2", LAST_PERIOD);
    expect(order.length).toBeGreaterThan(5);
    expect(
      order.every((row, i) => i === 0 || order[i - 1].value >= row.value),
    ).toBe(true);
  });

  it("reports a finite elasticity over the same joined sample", () => {
    const result = elasticity("barrios", "amb2", LAST_PERIOD);
    expect(result).not.toBeNull();
    expect(result!.n).toBeGreaterThanOrEqual(5);
    expect(result!.r2).toBeGreaterThanOrEqual(0);
    expect(result!.r2).toBeLessThanOrEqual(1);
    expect(result!.priceSpread).toBeGreaterThanOrEqual(1);
    expect(result!.rentSpread).toBeGreaterThanOrEqual(1);
    expect(result!.doubling).toBeCloseTo(2 ** result!.beta, 12);
  });
});

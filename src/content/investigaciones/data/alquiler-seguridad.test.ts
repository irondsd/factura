import { describe, expect, it } from "vitest";
import {
  coverage,
  dispersion,
  fit,
  ranked,
  rows,
  sensitivity,
} from "./alquiler-seguridad";

describe("alquiler-seguridad derived dataset", () => {
  it("keeps every barrio and nulls every score when rent is missing", () => {
    const data = rows("barrios");
    expect(data).toHaveLength(48);
    expect(new Set(data.map((row) => row.id)).size).toBe(data.length);

    for (const row of data) {
      expect(row.rentPerMetre === null).toBe(row.score === null);
      expect(row.score === null).toBe(row.cheap === null);
      expect(row.score === null).toBe(row.safe === null);
      if (row.score !== null) {
        expect(row.score).toBeGreaterThanOrEqual(0);
        expect(row.score).toBeLessThanOrEqual(100);
      }
    }
  });

  it("ranks scored rows best first and reports matching coverage", () => {
    const order = ranked("barrios");
    expect(order.length).toBeGreaterThan(5);
    expect(
      order.every((row, i) => i === 0 || order[i - 1].score >= row.score),
    ).toBe(true);

    const report = coverage("barrios");
    expect(report.total).toBe(48);
    expect(report.withData).toBe(order.length);
    expect(report.withData + report.missing.length).toBe(report.total);
    expect(report.missing.every((row) => row.of === report.total)).toBe(true);
  });

  it("uses one regression for the quoted fit, line and residuals", () => {
    const regression = fit("barrios");
    const chart = dispersion("barrios");
    expect(regression).not.toBeNull();
    expect(chart?.fit).toEqual(regression);
    expect(chart?.points).toHaveLength(regression!.n);

    for (const point of chart!.points) {
      expect(point.residual).toBeCloseTo(
        point.rentPerMetre -
          (regression!.intercept + regression!.slope * point.crimeRate),
        10,
      );
    }
  });

  it("only calls a result consensus when it appears in every sensitivity top", () => {
    const result = sensitivity("barrios");
    expect(result.combinations).toHaveLength(6);
    for (const row of result.consensus) {
      expect(
        result.combinations.every((combination) =>
          combination.top.some((candidate) => candidate.id === row.id),
        ),
      ).toBe(true);
    }
  });
});

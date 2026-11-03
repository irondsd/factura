import { describe, expect, it } from "vitest";
import { financialChartSchema, financialsMetadataSchema } from "./financials";
import { CI_CONTENT_FIXTURES } from "../repository/ci-fixtures";

const data = CI_CONTENT_FIXTURES.find((page) => page.section === "proveedores")!
  .metadata.financials!;
const chart = data.charts[0];

describe("CMS annual financial series", () => {
  it("preserves losses, zero and unavailable values distinctly", () => {
    expect(
      financialsMetadataSchema
        .parse(data)
        .charts[0].points.slice(1, 4)
        .map((p) => p.value),
    ).toEqual([-450, null, 0]);
  });
  it.each([
    {
      points: [
        { year: 2025, value: 1 },
        { year: 2025, value: 2 },
      ],
    },
    {
      points: [
        { year: 2025, value: 1 },
        { year: 2024, value: 2 },
      ],
    },
    {
      points: [
        { year: 2024, value: null },
        { year: 2025, value: 2 },
      ],
    },
    {
      points: [
        { year: 2024, value: "1,5" },
        { year: 2025, value: 2 },
      ],
    },
    {
      points: [
        { year: 2024, value: Infinity },
        { year: 2025, value: 2 },
      ],
    },
    { unit: "" },
    { entity: "" },
    { basis: "" },
    { note: "" },
    { sources: [{ label: "Bad", href: "javascript:alert(1)" }] },
  ])("refuses ambiguous or incomplete series: %j", (patch) => {
    expect(financialChartSchema.safeParse({ ...chart, ...patch }).success).toBe(
      false,
    );
  });
  it("requires a real review date and rejects unknown keys", () => {
    expect(
      financialsMetadataSchema.safeParse({ ...data, updated: "2026-02-30" })
        .success,
    ).toBe(false);
    expect(
      financialsMetadataSchema.safeParse({ ...data, currency: "ARS" }).success,
    ).toBe(false);
  });
  it("accepts sources centralized in Fuentes instead of chart links", () => {
    const { sources: _sources, ...withoutSources } = chart;
    expect(_sources).toBeDefined();
    expect(financialChartSchema.safeParse(withoutSources).success).toBe(true);
  });
  it.each([
    { rates: [{ year: 2018, date: "2018-12-31", arsPerUsd: 0 }] },
    { rates: [{ year: 2018, date: "2018-12-31", arsPerUsd: -1 }] },
    { rates: [{ year: 2018, date: "2019-12-31", arsPerUsd: 100 }] },
    { rates: [{ year: 2018, date: "2018-02-30", arsPerUsd: 100 }] },
    { rates: [data.usdConversion!.rates[1], data.usdConversion!.rates[0]] },
    { rates: [data.usdConversion!.rates[0], data.usdConversion!.rates[0]] },
    { rates: data.usdConversion!.rates.slice(1) },
  ])("rejects an invalid, duplicate or missing FX rate: %j", (patch) => {
    expect(
      financialsMetadataSchema.safeParse({
        ...data,
        usdConversion: { ...data.usdConversion, ...patch },
      }).success,
    ).toBe(false);
  });
  it("does not apply ARS conversion to a chart in another unit", () => {
    expect(
      financialsMetadataSchema.safeParse({
        ...data,
        charts: [{ ...chart, unit: "miles de ARS" }],
      }).success,
    ).toBe(false);
  });
});

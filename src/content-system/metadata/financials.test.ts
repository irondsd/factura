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
    { sources: [] },
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
});

import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { renderToHtml } from "../../../test/renderToHtml";
import { CI_CONTENT_FIXTURES } from "@/content-system/repository/ci-fixtures";
import {
  FinancialChart,
  IndicadoresFinancieros,
} from "./IndicadoresFinancieros";

const value = CI_CONTENT_FIXTURES.find(
  (page) => page.section === "proveedores",
)!.metadata.financials!;

describe("financial figure text and scale", async () => {
  it("server-renders values, provenance and accounting context", async () => {
    const html = await renderToHtml(
      createElement(IndicadoresFinancieros, { value }),
    );
    expect(html).toContain("<svg");
    expect(html).toContain("<title>2018: 1.250 millones de ARS</title>");
    expect(html).toContain("<table");
    for (const text of [
      "-450",
      "Sin dato",
      "millones de ARS",
      "separado",
      "sin valor financiero",
      "Fuente de prueba",
      "03/11/2026",
    ])
      expect(html).toContain(text);
  });
  it("does not connect observations over missing years or nulls", async () => {
    const chart = {
      ...value.charts[0],
      points: [
        { year: 2018, value: 1 },
        { year: 2019, value: null },
        { year: 2020, value: 2 },
        { year: 2022, value: 3 },
      ],
    };
    const html = await renderToHtml(createElement(FinancialChart, { chart }));
    expect(html).not.toContain('stroke-width="2.5"');
  });
  it("draws a finite scale for an all-zero series", async () => {
    const chart = {
      ...value.charts[0],
      points: [
        { year: 2024, value: 0 },
        { year: 2025, value: 0 },
      ],
    };
    const html = await renderToHtml(createElement(FinancialChart, { chart }));
    expect(html).not.toMatch(/NaN|Infinity/);
    expect(html).toContain('cy="228"');
  });
});

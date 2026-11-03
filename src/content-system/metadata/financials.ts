import { z } from "zod";
import { dataSourceSchema } from "./guias";

const text = z.string().trim().min(1);

/** Annual series only: never splice interim results into full-year totals.
 * Values are in the stated unit and accounting basis; null means unavailable.
 * The CMS owns the numbers so refreshing a report needs no deployment. */
export const financialChartSchema = z
  .object({
    title: text.max(100),
    entity: text.max(160),
    unit: text.max(80),
    basis: text.max(400),
    note: text.max(800),
    // Legacy provenance remains readable, but links are displayed only by Fuentes.
    sources: z.array(dataSourceSchema).max(20).optional(),
    points: z
      .array(
        z
          .object({
            year: z.number().int().min(1900).max(2100),
            value: z.number().finite().min(-1e15).max(1e15).nullable(),
          })
          .strict(),
      )
      .min(2)
      .max(60),
  })
  .strict()
  .superRefine((chart, ctx) => {
    if (
      chart.points.some(
        (point, index) =>
          index > 0 && point.year <= chart.points[index - 1].year,
      )
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["points"],
        message: "years must be unique and in ascending order",
      });
    }
    if (chart.points.filter((point) => point.value !== null).length < 2) {
      ctx.addIssue({
        code: "custom",
        path: ["points"],
        message: "at least two reported values are required",
      });
    }
  });

export const usdConversionSchema = z
  .object({
    basis: text.max(600),
    rates: z
      .array(
        z
          .object({
            year: z.number().int().min(1900).max(2100),
            date: z.iso.date(),
            arsPerUsd: z.number().finite().positive().max(1e12),
          })
          .strict(),
      )
      .min(1)
      .max(60),
  })
  .strict()
  .superRefine((conversion, ctx) => {
    conversion.rates.forEach((rate, index) => {
      if (Number(rate.date.slice(0, 4)) !== rate.year)
        ctx.addIssue({
          code: "custom",
          path: ["rates", index, "date"],
          message: "quote date must belong to its year",
        });
      if (index > 0 && rate.year <= conversion.rates[index - 1].year)
        ctx.addIssue({
          code: "custom",
          path: ["rates", index, "year"],
          message: "exchange-rate years must be unique and ascending",
        });
    });
  });

export const financialsMetadataSchema = z
  .object({
    updated: z.iso.date(),
    charts: z.array(financialChartSchema).min(1).max(8),
    usdConversion: usdConversionSchema.optional(),
  })
  .strict()
  .superRefine((financials, ctx) => {
    if (!financials.usdConversion) return;
    const years = new Set(
      financials.usdConversion.rates.map((rate) => rate.year),
    );
    financials.charts.forEach((chart, index) => {
      if (chart.unit !== "millones de ARS")
        ctx.addIssue({
          code: "custom",
          path: ["charts", index, "unit"],
          message: "USD conversion requires values in millones de ARS",
        });
      for (const point of chart.points)
        if (point.value !== null && !years.has(point.year))
          ctx.addIssue({
            code: "custom",
            path: ["usdConversion", "rates"],
            message: `missing ARS/USD quote for ${point.year}`,
          });
    });
  });

export type FinancialChartData = z.infer<typeof financialChartSchema>;
export type FinancialsMetadata = z.infer<typeof financialsMetadataSchema>;
export type UsdConversion = z.infer<typeof usdConversionSchema>;

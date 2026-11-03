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
    sources: z.array(dataSourceSchema).min(1).max(20),
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

export const financialsMetadataSchema = z
  .object({
    updated: z.iso.date(),
    charts: z.array(financialChartSchema).min(1).max(8),
  })
  .strict();

export type FinancialChartData = z.infer<typeof financialChartSchema>;
export type FinancialsMetadata = z.infer<typeof financialsMetadataSchema>;

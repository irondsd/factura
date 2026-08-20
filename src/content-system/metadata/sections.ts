import { z } from "zod";
import { faqItemSchema } from "./guias";

const text = z.string().trim().min(1);

export const dataSourceSchema = z
  .object({ label: text, href: z.string().url(), note: text.optional() })
  .strict();

export const datasetMetadataSchema = z
  .object({
    name: text,
    description: text,
    temporalCoverage: text,
    spatialCoverage: text,
    variableMeasured: z.array(text),
  })
  .strict();

/** JSONB contract for statistics and research pages.  These fields were
 * formerly exported from MDX modules and now travel with the CMS row. */
export const sectionMetadataSchema = z
  .object({
    keywords: z.array(text),
    categories: z.array(text).default([]),
    faq: z.array(faqItemSchema).optional(),
    ogTitle: text.optional(),
    ogDescription: text.optional(),
    ogStat: text.optional(),
    previewImage: z
      .string()
      .regex(
        /^\/img\/(estadisticas|investigaciones)\/previews\/.+\.(jpg|png|webp)$/,
      )
      .optional(),
    sources: z.array(dataSourceSchema).optional(),
    dataset: datasetMetadataSchema.optional(),
  })
  .strict();

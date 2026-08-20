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
    /** The page's preview image, as a media-library id (cms.media.md §2.2).
     *
     * A uuid rather than a path, so an article survives a change of storage
     * origin: the CDN hostname lives in configuration and is resolved at render
     * time. `previewImage` below is the pre-library shape — a file committed
     * under `public/img/**` — and is accepted only while the migration is in
     * flight. New writes set the id; step 7 of the rollout removes the string
     * once no page references one. */
    previewMediaId: z.uuid().optional(),
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

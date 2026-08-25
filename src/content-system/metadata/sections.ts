import { z } from 'zod'
import { dataSourceSchema, faqItemSchema } from './guias'

const text = z.string().trim().min(1)

// `dataSourceSchema` now lives beside the guide metadata, because a guide can
// carry sources too. Re-exported here so the modules that already read it from
// the section schema keep one import.
export { dataSourceSchema }

export const datasetMetadataSchema = z
  .object({
    name: text,
    description: text,
    temporalCoverage: text,
    spatialCoverage: text,
    variableMeasured: z.array(text),
    /** Licence URL for this page's table. Absent means the site-wide default
     * in `src/config/urls.ts`, which is what nearly every page wants. */
    license: z.string().url().optional(),
  })
  .strict()

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
    /** The page's preview image, as a media-library id (cms.md).
     *
     * A uuid rather than a path, so an article survives a change of storage
     * origin: the CDN hostname lives in configuration and is resolved at render
     * time. */
    previewMediaId: z.uuid().optional(),
    /** Who wrote the page, and who checked its numbers. Ids into `cms_author`;
     * existence is resolved by the document validator. */
    authorId: z.uuid().optional(),
    factCheckerId: z.uuid().optional(),
    sources: z.array(dataSourceSchema).optional(),
    dataset: datasetMetadataSchema.optional(),
  })
  .strict()

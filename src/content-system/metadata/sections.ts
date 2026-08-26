import { z } from "zod";
import { dataSourceSchema, guideMetadataSchema } from "./guias";

const text = z.string().trim().min(1);

// `dataSourceSchema` now lives beside the guide metadata, because a guide can
// carry sources too. Re-exported here so the modules that already read it from
// the section schema keep one import.
export { dataSourceSchema };

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
  .strict();

/** The JSONB contract for every CMS-backed page.
 *
 * Data pages are not a different kind of document: they use the article
 * metadata and may add dataset provenance and a legacy social-card statistic.
 * Whether a section *requires* those optional values is an editorial
 * validation rule, not a storage-format decision. Keeping one permissive
 * shape means a new section does not need another read/write schema branch. */
export const contentMetadataSchema = guideMetadataSchema.safeExtend({
  ogStat: text.optional(),
  dataset: datasetMetadataSchema.optional(),
});

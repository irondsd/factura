import { z } from "zod";
import { contentUrl, dataSourceSchema, guideMetadataSchema } from "./guias";

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
    license: contentUrl.optional(),
  })
  .strict();

const cardText = (max: number) => text.max(max).optional();

/** The company card behind `<ProviderSummary />`. Lengths are what fits the
 * card at a phone's width — a figure is a number or a word, not a sentence.
 * Whether a page may carry it at all is the validator's question (only
 * /proveedores), like every other section rule. */
export const providerMetadataSchema = z
  .object({
    logoMediaId: z.uuid().optional(),
    services: z.array(text.max(40)).max(6).optional(),
    website: contentUrl
      .refine((url) => url.startsWith("https://"), "must be an https:// URL")
      .optional(),
    customers: cardText(20),
    customersNote: cardText(40),
    since: cardText(20),
    sinceNote: cardText(40),
    kind: cardText(20),
    kindNote: cardText(40),
    headquarters: cardText(20),
    headquartersNote: cardText(40),
    cuit: z
      .string()
      .trim()
      .regex(/^\d{2}-\d{8}-\d$/, "must be written 30-12345678-9")
      .optional(),
    legalName: cardText(80),
    regulator: cardText(40),
    billName: cardText(80),
  })
  .strict();

/** The ratings behind `<Opiniones />`: what each platform shows, copied by
 * hand, and the day it was copied. */
export const reviewsMetadataSchema = z
  .object({
    updated: z.iso.date().optional(),
    sources: z
      .array(
        z
          .object({
            name: text.max(40),
            score: z.number().min(0).max(5),
            count: z.number().int().min(0).optional(),
            url: contentUrl.optional(),
          })
          .strict(),
      )
      .max(8),
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
  provider: providerMetadataSchema.optional(),
  reviews: reviewsMetadataSchema.optional(),
});

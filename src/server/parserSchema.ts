import { z } from "zod";
import type { ParserConfig } from "@/parsers/engine/types";

/**
 * Runtime validation for the parser-config "definition" (the engine body, minus
 * the slug/version/vendor metadata stored in dedicated columns). Mirrors the
 * hand-written types in engine/types.ts; the engine still throws at run time on
 * anything malformed that slips through, but this rejects gross errors at the
 * API boundary and keeps stored JSON well-formed.
 */

const transformOp = z.union([
  z.enum([
    "numberAR",
    "numberUS",
    "centsToAmount",
    "stripLeadingZeros",
    "monthOf",
    "monthYear",
    "monthYearEs",
    "toInt",
    "lowercase",
  ]),
  z.object({ slice: z.number().int() }),
  z.object({ parseDate: z.enum(["DMY", "YYMMDD"]) }),
  z.object({ lookup: z.record(z.string(), z.union([z.string(), z.number()])) }),
]);

const capture = z.object({
  pattern: z.string().min(1),
  flags: z.string().optional(),
  outputs: z.record(
    z.string(),
    z.object({
      group: z.union([z.number().int(), z.string()]),
      transform: z.array(transformOp).optional(),
    }),
  ),
});

const computeStep = z.union([
  z.object({ name: z.string(), expr: z.string() }),
  z.object({
    name: z.string(),
    datePart: z.object({
      date: z.string(),
      part: z.enum(["year", "month", "day"]),
    }),
  }),
  z.object({
    name: z.string(),
    dateFromParts: z.object({
      year: z.string(),
      month: z.string(),
      day: z.union([z.string(), z.number()]),
    }),
  }),
  z.object({
    name: z.string(),
    addMonths: z.object({ date: z.string(), delta: z.number().int() }),
  }),
  z.object({
    name: z.string(),
    formatDate: z.object({ date: z.string(), format: z.literal("YYMMDD") }),
  }),
  z.object({ name: z.string(), round: z.string() }),
  z.object({ name: z.string(), template: z.string() }),
  z.object({ name: z.string(), coalesce: z.array(z.string()) }),
  z.object({ name: z.string(), when: z.string(), use: z.number() }),
]);

const validation = z.union([
  z.object({
    type: z.literal("agree"),
    a: z.string(),
    b: z.string(),
    label: z.string(),
  }),
  z.object({
    type: z.literal("equals"),
    a: z.string(),
    b: z.string(),
    label: z.string(),
  }),
  z.object({
    type: z.literal("lineContainsAll"),
    linePattern: z.string(),
    flags: z.string().optional(),
    values: z.array(z.string()),
    label: z.string(),
  }),
]);

const fieldRule = z.object({
  sources: z.array(z.string()).min(1),
  mustAgree: z.boolean().optional(),
});

const customField = z.object({
  name: z.string().min(1),
  source: z.string().min(1),
  type: z.enum(["money", "number", "date", "string", "quantity"]),
  unit: z.string().optional(),
  includeWhen: z.string().optional(),
});

const signature = z.object({
  pattern: z.string().min(1),
  flags: z.string().optional(),
  weight: z.number().optional(),
});

/** Step-1 vendor matching, broken out so the collision check can validate a
 * candidate detect block on its own. */
export const detectSchema = z.object({
  allOf: z.array(signature).optional(),
  anyOf: z.array(signature).optional(),
  noneOf: z.array(signature).optional(),
});

/** The engine body — everything except slug/version/vendor. */
export const configBodySchema = z.object({
  region: z
    .object({
      before: z.string().optional(),
      after: z.string().optional(),
      flags: z.string().optional(),
    })
    .optional(),
  detect: detectSchema,
  captures: z.array(capture),
  compute: z.array(computeStep).optional(),
  validations: z.array(validation).optional(),
  roles: z.object({
    identity: fieldRule,
    amount: fieldRule,
    period: fieldRule,
    dueDate: fieldRule,
  }),
  custom: z.array(customField).optional(),
});

/** Catalog metadata carried on `parser_configs` columns (not the engine body).
 * Kept out of `configBodySchema` so the engine `ParserConfig` stays
 * vendor/country-agnostic. All optional — a bare parser still works. */
export const configMetaSchema = z.object({
  // A built-in category key or a user's custom label (free text) — see
  // src/parsers/categories.ts.
  category: z.string().min(1).max(60).optional(),
  region: z.string().max(120).optional(),
  provider: z.string().max(120).optional(),
  compat: z.string().max(200).optional(),
  forkedFrom: z.string().max(120).optional(),
});

/** Full create/test payload: column metadata + the definition body. */
export const configInputSchema = z
  .object({
    slug: z
      .string()
      .min(1)
      .max(60)
      .regex(/^[a-z0-9-]+$/, "lowercase letters, digits and dashes only"),
    displayName: z.string().min(1).max(60),
    vendorSlug: z
      .string()
      .min(1)
      .max(60)
      .regex(/^[a-z0-9-]+$/, "lowercase letters, digits and dashes only"),
    version: z.number().int().min(1).optional(),
    definition: configBodySchema,
  })
  .merge(configMetaSchema);

export type ConfigInput = z.infer<typeof configInputSchema>;
export type ConfigBody = z.infer<typeof configBodySchema>;

/** Assemble an engine-ready ParserConfig from a validated input payload. */
export function toEngineConfig(input: ConfigInput): ParserConfig {
  return {
    slug: input.slug,
    version: input.version ?? 1,
    vendor: {
      slug: input.vendorSlug,
      displayName: input.displayName,
    },
    ...input.definition,
  };
}

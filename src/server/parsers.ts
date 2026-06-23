import { parserConfigs } from "@/db/schema";
import type { ParsedResult, ParserConfig } from "@/parsers/engine/types";

type ParserConfigRow = typeof parserConfigs.$inferSelect;

/** Reconstruct an engine ParserConfig from a stored row. The `body` jsonb holds
 * the definition (detect/captures/compute/validations/roles/custom); the rest
 * comes from dedicated columns. */
export function rowToConfig(row: ParserConfigRow): ParserConfig {
  return {
    slug: row.slug,
    version: Number(row.version),
    vendor: {
      slug: row.vendorSlug,
      displayName: row.displayName,
    },
    ...(row.body as object),
  } as ParserConfig;
}

/** Bridge the engine's flexible result to the bills table's typed columns. Only
 * the vendor-agnostic roles land in dedicated columns; every custom field —
 * consumption, extraordinaria, data usage, whatever the parser defines — lives
 * in `bills.extra.fields` (see `resultToExtra`). */
export function resultToColumns(result: ParsedResult) {
  return {
    period: result.period,
    totalAmount: String(result.amount),
    dueDate: result.dueDate,
  };
}

/** The jsonb blob stored in `bills.extra`: the identity (read back by
 * confirmAccount) plus every extracted custom field. */
export function resultToExtra(result: ParsedResult) {
  return { accountNumber: result.identity, fields: result.custom };
}

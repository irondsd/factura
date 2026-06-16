import type { db as Db } from "@/db";
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
      category: row.category,
    },
    ...(row.body as object),
  } as ParserConfig;
}

/** Load and compile every preset. Cheap enough to call per request; can be
 * cached later if the table grows large. */
export async function loadParserConfigs(db: typeof Db): Promise<ParserConfig[]> {
  const rows = await db.query.parserConfigs.findMany();
  return rows.map(rowToConfig);
}

/** Bridge the engine's flexible result to the bills table's typed columns. The
 * four roles map to their columns; the well-known custom fields `consumption`
 * and `extraordinary` keep populating their legacy columns for the current UI,
 * while the full `custom` map is preserved in `bills.extra.fields`. */
export function resultToColumns(result: ParsedResult) {
  const consumption = result.custom.consumption;
  const extraordinary = result.custom.extraordinary;
  const hasConsumption =
    consumption !== undefined && typeof consumption === "object";
  return {
    period: result.period,
    totalAmount: String(result.amount),
    dueDate: result.dueDate,
    extraordinaryAmount:
      typeof extraordinary === "number" ? String(extraordinary) : null,
    consumptionValue: hasConsumption ? String(consumption.value) : null,
    consumptionUnit: hasConsumption ? consumption.unit : null,
  };
}

/** The jsonb blob stored in `bills.extra`: the identity (read back by
 * confirmAccount) plus every extracted custom field. */
export function resultToExtra(result: ParsedResult) {
  return { accountNumber: result.identity, fields: result.custom };
}

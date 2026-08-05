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

/** Where an owner's package sits between its editable draft and its published
 * history. Three states, not two: `draft` = never published (nothing exists for
 * anyone to adopt); `published` = the current draft is frozen as a version;
 * `unpublished` = it was published before, but the draft has moved ahead since. */
export type OwnerPublishState = "draft" | "published" | "unpublished";

/** Classify a package from its draft revision and the versions actually frozen
 * in `parser_versions`.
 *
 * `publishedVersions` must come from the version rows themselves, NOT from the
 * list the library renders: an owned package with nothing published still gets a
 * synthetic display row carrying the DRAFT number, and deriving the state from
 * that made a never-published draft claim it was published. */
export function ownerPublishState(
  draftVersion: number,
  publishedVersions: readonly number[],
): OwnerPublishState {
  if (publishedVersions.length === 0) return "draft";
  return Math.max(...publishedVersions) >= draftVersion
    ? "published"
    : "unpublished";
}

/** The names of the fields a config extracts — the four semantic roles
 * (identity surfaced as `accountNumber`) plus every custom field by name. Drives
 * the parser library's "fields extracted" chips. */
export function fieldsOf(config: ParserConfig): string[] {
  return [
    "amount",
    "period",
    "dueDate",
    "accountNumber",
    ...(config.custom ?? []).map((f) => f.name),
  ];
}

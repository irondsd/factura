import { describe, expect, it } from "vitest";
import {
  columnSettingsStorageKey,
  parseHiddenColumns,
} from "../columnPreferences";

describe("content column settings", () => {
  it("uses an independent storage key for each section", () => {
    expect(columnSettingsStorageKey("guias")).toBe("factura.cms.columns.guias");
    expect(columnSettingsStorageKey("noticias")).toBe(
      "factura.cms.columns.noticias",
    );
  });

  it("keeps only known optional columns from storage", () => {
    expect(
      parseHiddenColumns(
        JSON.stringify(["status", "page", "future-column", "updated"]),
      ),
    ).toEqual(["status", "updated"]);
  });

  it("falls back to every column visible for invalid storage", () => {
    expect(parseHiddenColumns("not json")).toEqual([]);
    expect(parseHiddenColumns(JSON.stringify({ hidden: ["status"] }))).toEqual(
      [],
    );
  });
});

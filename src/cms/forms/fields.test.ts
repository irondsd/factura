import { describe, expect, it } from "vitest";
import { sectionFields, toPatch } from "./fields";

describe("toPatch", () => {
  it("keeps unfinished required draft copy as strings, not SQL nulls", () => {
    const fields = sectionFields("investigacion");
    const values = Object.fromEntries(
      fields.map((field) => [field.path, field.path === "sortOrder" ? 0 : ""]),
    );

    const { columns } = toPatch(fields, values);

    expect(columns.description).toBe("");
    expect(columns.summary).toBe("");
    expect(columns.cta).toBe("");
    expect(columns.titleTag).toBeNull();
    expect(columns.canonicalSlug).toBeNull();
  });
});

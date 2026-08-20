import { describe, expect, it } from "vitest";
import { sectionFields, toPatch } from "./fields";

describe("toPatch", () => {
  it("keeps unfinished required draft copy as strings, not SQL nulls", () => {
    const fields = sectionFields("investigaciones");
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

  it("never submits a read-only field", () => {
    // The store's update whitelist drops `slug` regardless, so a slug in the
    // patch could only ever be a save that silently did nothing — and, worse,
    // one the hierarchy check still validated against.
    for (const section of ["guias", "estadisticas", "investigaciones"] as const) {
      const fields = sectionFields(section);
      const values = Object.fromEntries(
        fields.map((field) => [field.path, "cambiado"]),
      );

      const { columns } = toPatch(fields, values);

      expect(columns).not.toHaveProperty("slug");
    }
  });

  it("marks the slug read-only in every section", () => {
    // Guards the guard: dropping `readOnly` from a descriptor would make the
    // test above pass by having nothing to skip.
    for (const section of ["guias", "estadisticas", "investigaciones"] as const) {
      const slug = sectionFields(section).find(
        (field) => field.path === "slug",
      );
      expect(slug?.readOnly).toBe(true);
    }
  });
});

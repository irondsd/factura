import { describe, expect, it } from "vitest";
import { fieldState, sectionFields, toPatch } from "./fields";

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
    for (const section of [
      "guias",
      "estadisticas",
      "investigaciones",
    ] as const) {
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
    for (const section of [
      "guias",
      "estadisticas",
      "investigaciones",
    ] as const) {
      const slug = sectionFields(section).find(
        (field) => field.path === "slug",
      );
      expect(slug?.readOnly).toBe(true);
    }
  });
});

describe("fieldState", () => {
  const field = (
    section: Parameters<typeof sectionFields>[0],
    path: string,
  ) => {
    const found = sectionFields(section).find((f) => f.path === path);
    if (!found) throw new Error(`no ${path} field in ${section}`);
    return found;
  };

  const state = (
    section: Parameters<typeof sectionFields>[0],
    path: string,
    context: { body?: string; values?: Record<string, unknown> } = {},
  ) =>
    fieldState(field(section, path), {
      body: context.body ?? "",
      values: context.values ?? {},
    });

  it("hides the order of a top-level page and shows it once it has a mother", () => {
    // Nothing reads `sortOrder` on a top-level page: public listings sort by
    // date, so the field was a number with no consequence.
    expect(
      state("guias", "sortOrder", { values: { sortOrder: 0 } }).visible,
    ).toBe(false);
    expect(
      state("guias", "sortOrder", {
        values: { parentId: "a-parent-id", sortOrder: 0 },
      }).visible,
    ).toBe(true);
  });

  it("hides an order left over from before, and submits it untouched", () => {
    // Most top-level pages carry a non-zero order from when section listings
    // still read it. Showing the field for those would be showing it almost
    // everywhere, so the mother decides — and the value rides along in the
    // patch regardless, so hiding the control never rewrites it.
    expect(
      state("guias", "sortOrder", { values: { sortOrder: 14 } }).visible,
    ).toBe(false);

    const fields = sectionFields("guias");
    const { columns } = toPatch(fields, { sortOrder: 14 });
    expect(columns.sortOrder).toBe(14);
  });

  it("shows the FAQ only where the body places <Faq />, and requires it there", () => {
    expect(state("guias", "metadata.faq").visible).toBe(false);
    const placed = state("guias", "metadata.faq", { body: "texto\n<Faq />\n" });
    expect(placed).toEqual({ visible: true, required: true });
  });

  it("does not mistake another component for the one it waits on", () => {
    expect(
      state("guias", "metadata.faq", { body: "<FaqLista />" }).visible,
    ).toBe(false);
  });

  it("keeps questions on screen after the tag is deleted, so they can be removed", () => {
    expect(
      state("guias", "metadata.faq", {
        values: { "metadata.faq": [{ q: "¿Y?", a: "Pues eso." }] },
      }),
    ).toEqual({ visible: true, required: false });
  });

  it("asks for sources only when the page shows them", () => {
    expect(state("investigaciones", "metadata.sources")).toEqual({
      visible: false,
      required: false,
    });
    expect(
      state("investigaciones", "metadata.sources", { body: "<Fuentes />" }),
    ).toEqual({ visible: true, required: true });
  });

  it("leaves unconditional fields alone", () => {
    expect(state("guias", "title")).toEqual({ visible: true, required: true });
    expect(state("guias", "crumb")).toEqual({ visible: true, required: false });
  });
});

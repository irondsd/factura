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
      "noticias",
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
      "noticias",
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

describe("category fields", () => {
  it("offers the active categories supplied by the section store", () => {
    const category = sectionFields("estadisticas", [
      { key: "mercado-y-precios", label: "Mercado y precios" },
      { key: "alquileres", label: "Alquileres" },
    ]).find((field) => field.path === "metadata.categories");

    expect(category?.options).toEqual([
      { value: "mercado-y-precios", label: "Mercado y precios" },
      { value: "alquileres", label: "Alquileres" },
    ]);
  });

  it("shows categories in every authored section", () => {
    for (const section of [
      "guias",
      "noticias",
      "estadisticas",
      "investigaciones",
    ] as const) {
      expect(
        sectionFields(section).some(
          (field) => field.path === "metadata.categories",
        ),
      ).toBe(true);
    }
  });
});

describe("location fields", () => {
  it("offers the shared registry in its supplied order", () => {
    const locations = sectionFields(
      "guias",
      [],
      [],
      [
        { key: "caba", label: "CABA" },
        { key: "argentina", label: "Argentina" },
      ],
    ).find((field) => field.path === "metadata.locations");

    expect(locations).toMatchObject({
      kind: "locations",
      group: "estructura",
      options: [
        { value: "caba", label: "CABA" },
        { value: "argentina", label: "Argentina" },
      ],
    });
  });

  it("shows locations in every authored section", () => {
    for (const section of [
      "guias",
      "noticias",
      "estadisticas",
      "investigaciones",
    ] as const) {
      expect(
        sectionFields(section).some(
          (field) => field.path === "metadata.locations",
        ),
      ).toBe(true);
    }
  });
});

describe("section profiles", () => {
  it("builds every editor from the same article fields", () => {
    const shared = [
      "title",
      "description",
      "metadata.keywords",
      "metadata.categories",
      "metadata.ogImage",
      "metadata.sources",
    ];
    for (const section of [
      "guias",
      "noticias",
      "estadisticas",
      "investigaciones",
    ] as const) {
      const paths = sectionFields(section).map((field) => field.path);
      expect(paths).toEqual(expect.arrayContaining(shared));
    }
  });

  it("adds dataset fields only to data-backed section profiles", () => {
    expect(sectionFields("guias").map((field) => field.path)).not.toContain(
      "metadata.dataset",
    );
    for (const section of ["estadisticas", "investigaciones"] as const) {
      const paths = sectionFields(section).map((field) => field.path);
      expect(paths).toContain("metadata.dataset");
      expect(paths).toContain("metadata.ogStat");
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

  it("asks for a methodology only where the body places <Metodologia />", () => {
    // Same bargain as the FAQ: the tag is where the five lines render, so a
    // body without it has nothing to fill in. What is optional is *which* of
    // the five the page answers, not whether it answers any.
    expect(state("estadisticas", "metadata.methodology")).toEqual({
      visible: false,
      required: false,
    });
    expect(
      state("estadisticas", "metadata.methodology", {
        body: "<Metodologia />",
      }),
    ).toEqual({ visible: true, required: true });
  });

  it("keeps a methodology on screen after the tag is deleted, so it can be emptied", () => {
    expect(
      state("estadisticas", "metadata.methodology", {
        values: { "metadata.methodology": { period: "2021–2024." } },
      }),
    ).toEqual({ visible: true, required: false });
  });

  it("leaves unconditional fields alone", () => {
    expect(state("guias", "title")).toEqual({ visible: true, required: true });
    expect(state("guias", "crumb")).toEqual({ visible: true, required: false });
  });
});

describe("author credits", () => {
  const authors = [
    { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", name: "Ana Pérez" },
    { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", name: "Luis Gómez" },
  ];

  const credit = (section: Parameters<typeof sectionFields>[0], path: string) =>
    sectionFields(section, [], authors).find((field) => field.path === path);

  it("offers both credits in every section", () => {
    for (const section of [
      "guias",
      "noticias",
      "estadisticas",
      "investigaciones",
    ] as const) {
      expect(credit(section, "metadata.authorId")).toBeDefined();
      expect(credit(section, "metadata.factCheckerId")).toBeDefined();
    }
  });

  it("fills both selects from the same list of people", () => {
    for (const path of ["metadata.authorId", "metadata.factCheckerId"]) {
      expect(credit("guias", path)?.options).toEqual([
        { value: authors[0].id, label: "Ana Pérez" },
        { value: authors[1].id, label: "Luis Gómez" },
      ]);
    }
  });

  it("never demands a credit", () => {
    // Optional on purpose: an unsigned page is published by the organization,
    // which is what the markup said before authors existed.
    expect(credit("guias", "metadata.authorId")?.required).toBeUndefined();
    expect(credit("guias", "metadata.factCheckerId")?.required).toBeUndefined();
  });

  it("leaves the selects empty for a caller with no list to offer", () => {
    expect(
      sectionFields("guias").find((f) => f.path === "metadata.authorId")
        ?.options,
    ).toEqual([]);
  });
});

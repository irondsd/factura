import { describe, expect, it } from "vitest";
import type { ContentDocument } from "../types";
import {
  buildContentIndex,
  COLLECTION_CODES,
  validateCollection,
} from "./collection";
import { LEVEL_LAYERS, validateContentDocument } from "./index";

const doc = (
  over: Partial<ContentDocument> & { slug: string },
): ContentDocument => ({
  id: over.slug,
  section: "guias",
  status: "published",
  title: `Título de ${over.slug}`,
  titleTag: null,
  description: `Descripción de ${over.slug}`,
  summary: "s",
  cta: "c",
  canonicalSlug: null,
  parentId: null,
  sortOrder: 0,
  crumb: null,
  metadata: {
    keywords: ["a", "b", "c"],
    categories: ["servicios"],
    locations: ["argentina"],
  },
  body: "## Uno\n\n<RelatedGuides />\n",
  publishedAt: "2026-01-01T00:00:00-03:00",
  contentUpdatedAt: "2026-01-01T00:00:00-03:00",
  createdAt: "2026-01-01T00:00:00-03:00",
  updatedAt: "2026-01-01T00:00:00-03:00",
  createdBy: null,
  updatedBy: null,
  lockVersion: 1,
  ...over,
});

const codes = (documents: ContentDocument[]) =>
  validateCollection(documents).diagnostics.map((d) => d.code);

describe("buildContentIndex", () => {
  it("separates every slug from the published ones", () => {
    const index = buildContentIndex([
      { slug: "a", status: "published" },
      { slug: "b", status: "preview" },
      { slug: "c", status: "draft" },
    ]);
    expect([...index.slugs].sort()).toEqual(["a", "b", "c"]);
    expect([...index.publishedSlugs]).toEqual(["a"]);
  });
});

describe("colliding copy", () => {
  it("reports two pages sharing a title, against both", () => {
    const found = validateCollection([
      doc({ slug: "a", title: "Cuánto aumentó la luz" }),
      doc({ slug: "b", title: "Cuánto aumentó la luz" }),
    ]);
    expect(
      found.diagnostics.filter(
        (d) => d.code === COLLECTION_CODES.duplicateTitle,
      ),
    ).toHaveLength(2);
    expect(found.ok).toBe(false);
  });

  it("ignores case and accents when comparing", () => {
    // Two pages competing for the same result are competing whether or not one
    // of them capitalised differently.
    expect(
      codes([
        doc({ slug: "a", title: "Cuánto aumentó la luz" }),
        doc({ slug: "b", title: "cuanto aumento LA LUZ" }),
      ]),
    ).toContain(COLLECTION_CODES.duplicateTitle);
  });

  it("reports colliding descriptions", () => {
    expect(
      codes([
        doc({ slug: "a", description: "La misma frase exacta." }),
        doc({ slug: "b", description: "La misma frase exacta." }),
      ]),
    ).toContain(COLLECTION_CODES.duplicateDescription);
  });

  it("says nothing about distinct pages", () => {
    expect(codes([doc({ slug: "a" }), doc({ slug: "b" })])).toEqual([]);
  });
});

describe("canonicals across the collection", () => {
  it("rejects a published page canonicalizing to an unpublished one", () => {
    expect(
      codes([
        doc({ slug: "a", canonicalSlug: "b" }),
        doc({ slug: "b", status: "draft" }),
      ]),
    ).toContain(COLLECTION_CODES.canonicalUnpublished);
  });

  it("rejects a canonical chain", () => {
    // Search engines do not follow A → B → C reliably; the middle page's signal
    // is simply lost.
    expect(
      codes([
        doc({ slug: "a", canonicalSlug: "b" }),
        doc({ slug: "b", canonicalSlug: "c" }),
        doc({ slug: "c" }),
      ]),
    ).toContain(COLLECTION_CODES.canonicalChain);
  });

  it("accepts a plain canonical to a published page", () => {
    expect(
      codes([doc({ slug: "a", canonicalSlug: "b" }), doc({ slug: "b" })]),
    ).toEqual([]);
  });

  it("stays quiet about a canonical target that does not exist", () => {
    // The document layer already reports that; two messages for one mistake is
    // worse than one.
    expect(codes([doc({ slug: "a", canonicalSlug: "no-existe" })])).toEqual([]);
  });
});

describe("duplicate paths", () => {
  it("rejects two documents at the same path", () => {
    expect(
      codes([doc({ slug: "a", id: "1" }), doc({ slug: "a", id: "2" })]),
    ).toContain(COLLECTION_CODES.duplicateSlug);
  });
});

describe("validation levels", () => {
  const broken = doc({
    slug: "roto",
    title: "x".repeat(80), // document-level error
    body: "## Uno\n\n<RelatedGuides />\n",
  });

  it("lets a draft save through an ordinary editorial error", () => {
    // cms.md: a draft may be incomplete. Only the grammar has to hold.
    expect(validateContentDocument(broken, "draft").ok).toBe(true);
  });

  it("blocks a preview on the same error", () => {
    expect(validateContentDocument(broken, "preview").ok).toBe(false);
  });

  it("blocks a publish on the same error", () => {
    expect(validateContentDocument(broken, "publish").ok).toBe(false);
  });

  it("refuses forbidden syntax at every level, including draft", () => {
    const dangerous = doc({ slug: "x", body: "{alert(1)}\n" });
    for (const level of Object.keys(
      LEVEL_LAYERS,
    ) as (keyof typeof LEVEL_LAYERS)[]) {
      expect(validateContentDocument(dangerous, level).ok).toBe(false);
    }
  });

  it("stops after grammar rather than piling on noise", () => {
    // A body that does not parse makes every later layer report about a tree
    // that was never there.
    const result = validateContentDocument(
      doc({ slug: "x", title: "x".repeat(80), body: "<script>1</script>\n" }),
      "publish",
    );
    expect(result.diagnostics.every((d) => d.code.startsWith("mdx."))).toBe(
      true,
    );
  });

  it("only applies collection rules at publish level", () => {
    const a = doc({ slug: "a", title: "Idéntico" });
    const b = doc({ slug: "b", title: "Idéntico" });
    const index = buildContentIndex([a, b]);

    expect(
      validateContentDocument(a, "preview", { index, collection: [a, b] }).ok,
    ).toBe(true);
    expect(
      validateContentDocument(a, "publish", { index, collection: [a, b] }).ok,
    ).toBe(false);
  });

  it("attributes only this document's collection findings to it", () => {
    const a = doc({ slug: "a", title: "Idéntico" });
    const b = doc({ slug: "b", title: "Idéntico" });
    const result = validateContentDocument(a, "publish", {
      index: buildContentIndex([a, b]),
      collection: [a, b],
    });
    const collisions = result.diagnostics.filter(
      (d) => d.code === COLLECTION_CODES.duplicateTitle,
    );
    expect(collisions).toHaveLength(1);
    expect(collisions[0].message).toContain("guias/b");
  });
});

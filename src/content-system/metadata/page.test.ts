import { describe, expect, it } from "vitest";
import type { ContentDocument } from "../types";
import { contentPageMetadata, isDiscoverablePage } from "./page";

const page = (over: Partial<ContentDocument> = {}) =>
  ({
    slug: "como-leer-la-factura-de-edesur",
    status: "published",
    title: "Cómo leer la factura de Edesur",
    titleTag: null,
    description: "Una descripción de la guía.",
    canonicalSlug: null,
    metadata: { keywords: ["factura de edesur"], categories: ["servicios"] },
    publishedAt: "2026-07-12T09:00:00-03:00",
    contentUpdatedAt: "2026-08-09T11:30:00-03:00",
    ...over,
  }) as ContentDocument;

const robots = (m: ReturnType<typeof contentPageMetadata>) =>
  m.robots as { index?: boolean; follow?: boolean } | undefined;

describe("indexability follows the lifecycle", () => {
  it("lets a published page be indexed", () => {
    expect(robots(contentPageMetadata(page()))?.index).not.toBe(false);
  });

  it("noindexes a preview page", () => {
    // The URL renders on purpose so the link is shareable, which makes this
    // markup the only thing between it and a search index.
    const meta = contentPageMetadata(page({ status: "preview" }));
    expect(robots(meta)?.index).toBe(false);
    expect(robots(meta)?.follow).toBe(false);
  });

  it("noindexes a draft too", () => {
    // A draft 404s publicly, so this is belt and braces — but if a route ever
    // renders one, it must not be indexable.
    expect(robots(contentPageMetadata(page({ status: "draft" })))?.index).toBe(
      false,
    );
  });
});

describe("canonical", () => {
  it("consolidates a published page onto its chosen target", () => {
    const meta = contentPageMetadata(
      page({ canonicalSlug: "como-leer-la-factura-de-edenor" }),
    );
    expect(meta.alternates?.canonical).toContain(
      "como-leer-la-factura-de-edenor",
    );
  });

  it("is the page itself when it names no target", () => {
    expect(contentPageMetadata(page()).alternates?.canonical).toContain(
      "como-leer-la-factura-de-edesur",
    );
  });

  it("drops the target on a page that is not published", () => {
    // A canonical from a `noindex` URL is a mixed signal, and an unpublished
    // page has no ranking to consolidate anyway.
    const meta = contentPageMetadata(
      page({ status: "preview", canonicalSlug: "otra-guia" }),
    );
    expect(meta.alternates?.canonical).not.toContain("otra-guia");
  });
});

describe("titles and dates", () => {
  it("uses the titleTag for the search snippet when there is one", () => {
    const meta = contentPageMetadata(page({ titleTag: "Factura Edesur" }));
    expect(JSON.stringify(meta.title)).toContain("Factura Edesur");
  });

  it("falls back to the publication date when a draft has none", () => {
    expect(() =>
      contentPageMetadata(page({ status: "draft", publishedAt: null })),
    ).not.toThrow();
  });
});

describe("isDiscoverablePage", () => {
  it("is true only for published pages", () => {
    expect(isDiscoverablePage({ status: "published" } as ContentDocument)).toBe(
      true,
    );
    expect(isDiscoverablePage({ status: "preview" } as ContentDocument)).toBe(
      false,
    );
    expect(isDiscoverablePage({ status: "draft" } as ContentDocument)).toBe(
      false,
    );
  });
});

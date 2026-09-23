import { describe, expect, it } from "vitest";
import type { ContentCategory } from "../categories/types";
import type { ContentSection, ContentSummary } from "../types";
import { resolveInsightCards } from "./resolve";
import type { ContentInsight } from "./types";

const page = (
  id: string,
  section: ContentSection,
  slug: string,
  categories: string[],
): ContentSummary =>
  ({
    id,
    section,
    slug,
    metadata: { categories },
  }) as unknown as ContentSummary;

const category = (section: ContentSection, key: string, label: string) =>
  ({ section, key, label }) as ContentCategory;

const insight = (
  id: string,
  pageId: string,
  date: string,
  extra: Partial<ContentInsight> = {},
): ContentInsight => ({
  id,
  pageId,
  title: `Título ${id}`,
  body: `Texto ${id}`,
  date,
  onHomepage: false,
  createdBy: null,
  updatedBy: null,
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
  ...extra,
});

describe("resolveInsightCards", () => {
  const pages = new Map<ContentSection, ContentSummary[]>([
    [
      "estadisticas",
      [page("p1", "estadisticas", "inflacion/gba", ["precios", "vivienda"])],
    ],
    ["guias", [page("p2", "guias", "leer-factura-edesur", [])]],
  ]);
  const categories = new Map<ContentSection, ContentCategory[]>([
    [
      "estadisticas",
      [
        category("estadisticas", "vivienda", "Vivienda"),
        category("estadisticas", "precios", "Precios"),
      ],
    ],
  ]);

  it("takes the address and the primary category from the page", () => {
    const [card] = resolveInsightCards(
      [insight("a", "p1", "2026-08-01")],
      pages,
      categories,
    );
    expect(card.href).toBe("/estadisticas/inflacion/gba");
    expect(card.section).toBe("estadisticas");
    // The first key, not the first category in section order.
    expect(card.category).toBe("Precios");
  });

  it("leaves the category empty when the page has none", () => {
    const [card] = resolveInsightCards(
      [insight("a", "p2", "2026-08-01")],
      pages,
      categories,
    );
    expect(card.category).toBeNull();
  });

  it("drops insights whose page is not among the published pages given", () => {
    const cards = resolveInsightCards(
      [insight("a", "p1", "2026-08-01"), insight("b", "draft", "2026-09-01")],
      pages,
      categories,
    );
    expect(cards.map((c) => c.id)).toEqual(["a"]);
  });

  it("orders newest first, with a total order on ties", () => {
    const cards = resolveInsightCards(
      [
        insight("c", "p1", "2026-07-01"),
        insight("b", "p2", "2026-08-01"),
        insight("a", "p1", "2026-08-01"),
      ],
      pages,
      categories,
    );
    expect(cards.map((c) => c.id)).toEqual(["a", "b", "c"]);
  });
});

import { describe, expect, it } from "vitest";
import { dataLicense } from "@/config/urls";
import { sectionPageLd } from "./structuredData";

// The `Dataset` node's licence. Google reports a dataset without one as an
// unoptimised rich result, and every statistics and research page emits one of
// these — so the field is not allowed to depend on an author remembering it.

const page = (license?: string) =>
  sectionPageLd({
    id: "estadisticas",
    slug: ["alquiler-caba"],
    title: "Precio de publicación de departamentos en alquiler",
    description: "Precio pedido por barrio y comuna.",
    keywords: ["alquiler caba"],
    published: "2026-01-01T00:00:00.000Z",
    updated: "2026-06-01T00:00:00.000Z",
    sources: [
      { label: "IDECBA", href: "https://www.estadisticaciudad.gob.ar/" },
    ],
    dataset: {
      name: "Alquileres por barrio",
      description: "Precio de publicación mensual por barrio.",
      temporalCoverage: "2024-01/2026-06",
      spatialCoverage: "Ciudad Autónoma de Buenos Aires",
      variableMeasured: ["precio de alquiler"],
      ...(license ? { license } : {}),
    },
    words: 1200,
    minutes: 6,
  });

const datasetNode = (graph: ReturnType<typeof sectionPageLd>) =>
  graph["@graph"].find((node) => node["@type"] === "Dataset") as Record<
    string,
    unknown
  >;

describe("sectionPageLd", () => {
  it("licenses a page that says nothing about it under the site-wide terms", () => {
    expect(datasetNode(page()).license).toBe(dataLicense.url);
  });

  it("lets a page whose numbers travel under other terms name them", () => {
    const own = "https://creativecommons.org/publicdomain/zero/1.0/";
    expect(datasetNode(page(own)).license).toBe(own);
  });

  it("keeps the licence off the article node, which is not the dataset", () => {
    const article = page()["@graph"].find(
      (node) => node["@type"] === "Article",
    ) as Record<string, unknown>;
    expect(article.license).toBeUndefined();
  });
});

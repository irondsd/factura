import { describe, expect, it } from "vitest";
import { dataLicense, siteUrl } from "@/config/urls";
import { guideLd, sectionPageLd, siteLd } from "./structuredData";

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

// Author credits in article markup. Nothing on the page shows these yet, so
// these tests are the only thing standing between a change here and silently
// wrong structured data on every published page.

const ana = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  name: "Ana Pérez",
  slug: "ana-perez",
  jobTitle: "Analista de datos",
  tagline: "10 años leyendo estadísticas públicas",
  image: "https://media.factura.uno/media/ana.jpg",
};

const luis = {
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  name: "Luis Gómez",
  slug: null,
  jobTitle: null,
  tagline: null,
  image: null,
};

const guide = (credits?: Parameters<typeof guideLd>[0]["credits"]) =>
  guideLd({
    slug: "como-leer-la-factura-de-edesur",
    title: "Cómo leer la factura de Edesur",
    description: "Qué significa cada sección.",
    keywords: ["factura edesur"],
    published: "2026-01-01T00:00:00.000Z",
    updated: "2026-06-01T00:00:00.000Z",
    words: 900,
    minutes: 5,
    ...(credits ? { credits } : {}),
  });

const nodeOfType = (graph: { "@graph": unknown[] }, type: string) =>
  graph["@graph"].find(
    (node) => (node as { "@type": string })["@type"] === type,
  ) as Record<string, unknown> | undefined;

describe("article credits", () => {
  it("attributes an uncredited page to the organization, as before", () => {
    const article = nodeOfType(guide(), "BlogPosting");
    expect(article?.author).toEqual({ "@id": `${siteUrl}/#organization` });
    // No fact checker, no WebPage node: the graph is the one node it always was.
    expect(nodeOfType(guide(), "WebPage")).toBeUndefined();
  });

  it("names the author as a Person tied to the publisher", () => {
    const author = nodeOfType(guide({ author: ana }), "BlogPosting")
      ?.author as Record<string, unknown>;
    expect(author["@type"]).toBe("Person");
    expect(author.name).toBe("Ana Pérez");
    expect(author.jobTitle).toBe("Analista de datos");
    expect(author.description).toBe("10 años leyendo estadísticas públicas");
    expect(author.worksFor).toEqual({ "@id": `${siteUrl}/#organization` });
  });

  it("identifies an author by their future page without linking to it", () => {
    const author = nodeOfType(guide({ author: ana }), "BlogPosting")
      ?.author as Record<string, unknown>;
    // `@id` is an identifier the author page will merge with; `url` would be a
    // crawlable link to a page that does not exist yet.
    expect(author["@id"]).toBe(`${siteUrl}/autores/ana-perez#person`);
    expect(author.url).toBeUndefined();
  });

  it("leaves an author with no address anonymous rather than guessing one", () => {
    const author = nodeOfType(guide({ author: luis }), "BlogPosting")
      ?.author as Record<string, unknown>;
    expect(author["@id"]).toBeUndefined();
    expect(author.name).toBe("Luis Gómez");
    // Absent, not null: an empty jobTitle is not a claim worth publishing.
    expect("jobTitle" in author).toBe(false);
    expect("image" in author).toBe(false);
  });

  it("puts the fact checker on a WebPage node, where reviewedBy belongs", () => {
    const graph = guide({ author: ana, factChecker: luis });
    const page = nodeOfType(graph, "WebPage");
    const article = nodeOfType(graph, "BlogPosting");
    expect(page?.["@id"]).toBe(
      `${siteUrl}/guias/como-leer-la-factura-de-edesur`,
    );
    expect((page?.reviewedBy as Record<string, unknown>).name).toBe(
      "Luis Gómez",
    );
    // The two nodes describe one page rather than talking past each other.
    expect(page?.mainEntity).toEqual({ "@id": article?.["@id"] });
    expect(article?.mainEntityOfPage).toBe(page?.["@id"]);
  });

  it("carries credits on a data page too", () => {
    const graph = sectionPageLd({
      id: "estadisticas",
      slug: ["alquiler-caba"],
      title: "Alquileres",
      description: "Precio pedido por barrio.",
      keywords: ["alquiler caba"],
      published: "2026-01-01T00:00:00.000Z",
      updated: "2026-06-01T00:00:00.000Z",
      sources: [
        { label: "IDECBA", href: "https://www.estadisticaciudad.gob.ar/" },
      ],
      dataset: {
        name: "Alquileres por barrio",
        description: "Precio mensual por barrio.",
        temporalCoverage: "2024-01/2026-06",
        spatialCoverage: "CABA",
        variableMeasured: ["precio de alquiler"],
      },
      words: 1200,
      minutes: 6,
      credits: { author: ana, factChecker: luis },
    });
    expect(
      (nodeOfType(graph, "Article")?.author as Record<string, unknown>).name,
    ).toBe("Ana Pérez");
    expect(nodeOfType(graph, "WebPage")).toBeDefined();
    // The Dataset node is untouched by any of this.
    expect(nodeOfType(graph, "Dataset")?.name).toBe("Alquileres por barrio");
  });

  it("drops a portrait that is not an absolute URL", () => {
    // What `publicMediaUrl` returns on a box with no media origin configured.
    const local = { ...ana, image: "/media/ana.jpg" };
    const author = nodeOfType(guide({ author: local }), "BlogPosting")
      ?.author as Record<string, unknown>;
    expect("image" in author).toBe(false);
  });
});

describe("article locations", () => {
  it("describes exact geographic scope as identified Place nodes", () => {
    const article = nodeOfType(
      guideLd({
        slug: "como-leer-la-factura-de-edesur",
        title: "Cómo leer la factura de Edesur",
        description: "Qué significa cada sección.",
        keywords: ["factura edesur"],
        published: "2026-01-01T00:00:00.000Z",
        updated: "2026-06-01T00:00:00.000Z",
        words: 900,
        minutes: 5,
        locations: [{ label: "CABA", slug: "caba" }],
      }),
      "BlogPosting",
    );

    expect(article?.spatialCoverage).toEqual([
      {
        "@type": "Place",
        "@id": `${siteUrl}/ubicacion/caba#place`,
        name: "CABA",
        url: `${siteUrl}/ubicacion/caba`,
      },
    ]);
  });

  it("uses the same normalized places for a dataset's spatial coverage", () => {
    const graph = sectionPageLd({
      id: "estadisticas",
      slug: ["alquiler-caba"],
      title: "Alquileres",
      description: "Precio pedido por barrio.",
      keywords: ["alquiler caba"],
      published: "2026-01-01T00:00:00.000Z",
      updated: "2026-06-01T00:00:00.000Z",
      sources: [
        { label: "IDECBA", href: "https://www.estadisticaciudad.gob.ar/" },
      ],
      dataset: {
        name: "Alquileres por barrio",
        description: "Precio mensual por barrio.",
        temporalCoverage: "2024-01/2026-06",
        spatialCoverage: "Texto anterior que ya no es la fuente canónica",
        variableMeasured: ["precio de alquiler"],
      },
      words: 1200,
      minutes: 6,
      locations: [{ label: "CABA", slug: "caba" }],
    });

    expect(nodeOfType(graph, "Dataset")?.spatialCoverage).toEqual([
      {
        "@type": "Place",
        "@id": `${siteUrl}/ubicacion/caba#place`,
        name: "CABA",
        url: `${siteUrl}/ubicacion/caba`,
      },
    ]);
  });
});

describe("organization", () => {
  it("uses the crawlable 512px brand asset rather than the 32px app icon", () => {
    const organization = nodeOfType(siteLd("es"), "Organization");
    expect(organization?.logo).toBe(`${siteUrl}/logo.svg`);
  });
});

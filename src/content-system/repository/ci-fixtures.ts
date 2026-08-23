import type { ContentDocument, ContentSection, ContentSummary } from "../types";
import { type ContentRepository, pathToSlug } from "./contract";

// A tiny, deterministic corpus for CI production builds. This is deliberately
// not a snapshot of editorial data: publishing in the CMS must never create a
// repository change. These three documents exercise the same public rendering
// and discovery paths as production while remaining code-owned test fixtures.
const DATE = "2026-01-15T12:00:00.000Z";

export const CI_CONTENT_FIXTURES: readonly ContentDocument[] = [
  {
    id: "00000000-0000-4000-8000-000000000001",
    section: "guias",
    slug: "ci-guia",
    status: "published",
    body: "## Una guía de CI\n\nEste artículo mínimo comprueba que el contenido del CMS compila y se renderiza durante el build.\n",
    title: "Guía de prueba para CI",
    titleTag: null,
    description:
      "Página mínima de prueba que verifica el renderizado de una guía del CMS durante el build de integración continua.",
    summary: "Una guía mínima usada exclusivamente por el build de CI.",
    cta: "Probá Factura con una factura real.",
    canonicalSlug: null,
    parentId: null,
    sortOrder: 0,
    crumb: "Guía CI",
    metadata: {
      keywords: ["facturas", "prueba", "ci"],
      categories: ["facturas-y-conceptos"],
    },
    publishedAt: DATE,
    contentUpdatedAt: DATE,
    createdAt: DATE,
    updatedAt: DATE,
    createdBy: null,
    updatedBy: null,
    lockVersion: 1,
  },
  {
    id: "00000000-0000-4000-8000-000000000002",
    section: "noticias",
    slug: "ci-noticia",
    status: "published",
    body: "## Una noticia de CI\n\nEsta página mínima comprueba que una noticia del CMS compila y se renderiza durante el build.\n",
    title: "Noticia de prueba para CI",
    titleTag: null,
    description:
      "Página mínima de prueba que verifica el renderizado de una noticia del CMS durante el build de integración continua.",
    summary: "Una noticia mínima usada exclusivamente por el build de CI.",
    cta: "Conocé Factura.",
    canonicalSlug: null,
    parentId: null,
    sortOrder: 0,
    crumb: "Noticia CI",
    metadata: { keywords: ["noticias", "prueba", "ci"], categories: [] },
    publishedAt: DATE,
    contentUpdatedAt: DATE,
    createdAt: DATE,
    updatedAt: DATE,
    createdBy: null,
    updatedBy: null,
    lockVersion: 1,
  },
  {
    id: "00000000-0000-4000-8000-000000000004",
    section: "estadisticas",
    slug: "ci-estadistica",
    status: "published",
    body: "## Una estadística de CI\n\nEsta página mínima comprueba que una estadística del CMS compila y se renderiza durante el build.\n",
    title: "Estadística de prueba para CI",
    titleTag: null,
    description:
      "Página mínima de prueba que verifica el renderizado de una estadística del CMS durante el build de integración continua.",
    summary: "Una estadística mínima usada exclusivamente por el build de CI.",
    cta: "Seguí tus gastos reales con Factura.",
    canonicalSlug: null,
    parentId: null,
    sortOrder: 0,
    crumb: "Estadística CI",
    metadata: {
      keywords: ["estadísticas", "prueba", "ci"],
      categories: [],
      ogStat: "CI",
      sources: [{ label: "Fixture de CI", href: "https://factura.uno" }],
      dataset: {
        name: "Dataset de prueba para CI",
        description: "Un dataset mínimo y determinista para el build.",
        temporalCoverage: "2026-01",
        spatialCoverage: "Argentina",
        variableMeasured: ["valor de prueba"],
      },
    },
    publishedAt: DATE,
    contentUpdatedAt: DATE,
    createdAt: DATE,
    updatedAt: DATE,
    createdBy: null,
    updatedBy: null,
    lockVersion: 1,
  },
  {
    id: "00000000-0000-4000-8000-000000000003",
    section: "investigaciones",
    slug: "ci-investigaciones",
    status: "published",
    body: "## Una investigación de CI\n\nEsta página mínima comprueba que una investigación del CMS compila y se renderiza durante el build.\n",
    title: "Investigación de prueba para CI",
    titleTag: null,
    description:
      "Página mínima de prueba que verifica el renderizado de una investigación del CMS durante el build de integración continua.",
    summary:
      "Una investigación mínima usada exclusivamente por el build de CI.",
    cta: "Convertí tus facturas en información útil.",
    canonicalSlug: null,
    parentId: null,
    sortOrder: 0,
    crumb: "Investigación CI",
    metadata: {
      keywords: ["investigación", "prueba", "ci"],
      categories: [],
      ogStat: "CI",
      sources: [{ label: "Fixture de CI", href: "https://factura.uno" }],
      dataset: {
        name: "Análisis de prueba para CI",
        description: "Un análisis mínimo y determinista para el build.",
        temporalCoverage: "2026-01",
        spatialCoverage: "Argentina",
        variableMeasured: ["resultado de prueba"],
      },
    },
    publishedAt: DATE,
    contentUpdatedAt: DATE,
    createdAt: DATE,
    updatedAt: DATE,
    createdBy: null,
    updatedBy: null,
    lockVersion: 1,
  },
];

function withoutBody(document: ContentDocument): ContentSummary {
  const { body, ...summary } = document;
  void body;
  return summary;
}

export class CiFixtureContentRepository implements ContentRepository {
  async getByPath(
    section: ContentSection,
    slug: string[],
  ): Promise<ContentDocument | null> {
    return (
      CI_CONTENT_FIXTURES.find(
        (document) =>
          document.section === section &&
          document.slug === pathToSlug(slug) &&
          document.status !== "draft",
      ) ?? null
    );
  }

  async listPublished(section: ContentSection): Promise<ContentSummary[]> {
    return CI_CONTENT_FIXTURES.filter(
      (document) =>
        document.section === section && document.status === "published",
    ).map(withoutBody);
  }

  async listPubliclyRenderable(
    section: ContentSection,
  ): Promise<ContentSummary[]> {
    return CI_CONTENT_FIXTURES.filter(
      (document) => document.section === section && document.status !== "draft",
    ).map(withoutBody);
  }

  /** No fixture has ever been renamed, so nothing redirects. The method exists
   * because the contract has it: a CI build must exercise the same code path
   * the live site takes, including the miss. */
  async redirectFor(): Promise<string[] | null> {
    return null;
  }
}

export const ciFixtureContentRepository = new CiFixtureContentRepository();

export const CI_CONTENT_FIXTURE_PATHS = [
  "/guias/ci-guia",
  "/noticias/ci-noticia",
  "/estadisticas/ci-estadistica",
  "/investigaciones/ci-investigaciones",
] as const;

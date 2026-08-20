import "server-only";
import type { MDXComponents } from "mdx/types";
import type { ComponentType } from "react";
import { sectionRepository } from "@/content-system/repository/sections";
import type { ContentDocument, ContentSummary } from "@/content-system/types";

/** Metadata adapted for the existing section layouts and SEO helpers. */
export type SectionMeta = {
  title: string;
  titleTag?: string;
  description: string;
  ogTitle?: string;
  ogDescription?: string;
  ogStat?: string;
  summary: string;
  preview?: string;
  cta: string;
  keywords: string[];
  published: string;
  updated: string;
  sources: { label: string; href: string; note?: string }[];
  dataset: {
    name: string;
    description: string;
    temporalCoverage: string;
    spatialCoverage: string;
    variableMeasured: string[];
  };
  faq?: { q: string; a: string }[];
  noindex?: true;
};

export type SectionConfig = {
  id: string;
  label: string;
  backLabel: string;
  relatedLabel: string;
};

export type SectionPage = {
  slug: string[];
  crumb: string;
  meta: SectionMeta;
};

export type ContentSection = SectionConfig & {
  base: string;
  slugPath(slug: string[]): string;
  href(slug: string[]): string;
  /** Known CMS paths to warm at build time. Unknown paths still render on
   * demand because the page routes keep `dynamicParams = true`. */
  slugs(): Promise<string[][]>;
  load(slug: string[]): Promise<{
    Content: ComponentType<{ components?: MDXComponents }>;
    meta: SectionMeta;
    crumb: string;
    document: ContentDocument;
  } | null>;
  listed(): Promise<SectionPage[]>;
  children(slug: string[]): Promise<SectionPage[]>;
  crumbs(slug: string[]): Promise<{ name: string; href: string }[]>;
};

function metaFromDatabase(document: ContentSummary): SectionMeta {
  return {
    title: document.title,
    ...(document.titleTag ? { titleTag: document.titleTag } : {}),
    description: document.description,
    summary: document.summary,
    cta: document.cta,
    keywords: document.metadata.keywords,
    published: document.publishedAt ?? document.contentUpdatedAt,
    updated: document.contentUpdatedAt,
    sources: document.metadata.sources ?? [],
    dataset: document.metadata.dataset ?? {
      name: document.title,
      description: document.description,
      temporalCoverage: document.contentUpdatedAt.slice(0, 7),
      spatialCoverage: "Argentina",
      variableMeasured: [],
    },
    ...(document.metadata.ogTitle
      ? { ogTitle: document.metadata.ogTitle }
      : {}),
    ...(document.metadata.ogDescription
      ? { ogDescription: document.metadata.ogDescription }
      : {}),
    ...(document.metadata.ogStat ? { ogStat: document.metadata.ogStat } : {}),
    ...(document.metadata.previewImage
      ? { preview: document.metadata.previewImage }
      : {}),
    ...(document.metadata.faq ? { faq: document.metadata.faq } : {}),
    ...(document.status !== "published" ? { noindex: true } : {}),
  };
}

/** Database-backed section model used by public routes and CMS previews. */
export function createSection(config: SectionConfig): ContentSection {
  const base = `/${config.id}`;
  const repository = sectionRepository(config.id)!;
  const slugPath = (slug: string[]): string => slug.join("/");
  const href = (slug: string[]): string => `${base}/${slugPath(slug)}`;

  const allPages = async (): Promise<SectionPage[]> =>
    (await repository.listPubliclyRenderable()).map((document) => ({
      slug: document.slug.split("/"),
      crumb: document.crumb ?? document.title,
      meta: metaFromDatabase(document),
    }));

  return {
    ...config,
    base,
    slugPath,
    href,
    async slugs() {
      return (await repository.listPubliclyRenderable()).map((document) =>
        document.slug.split("/"),
      );
    },
    async load(slug) {
      const document = await repository.getByPath(slugPath(slug));
      if (!document) return null;
      const { compileContent } =
        await import("@/content-system/render/renderContent");
      return {
        Content: await compileContent(document.body, document.section),
        meta: metaFromDatabase(document),
        crumb: document.crumb ?? document.title,
        document,
      };
    },
    async listed() {
      return (await allPages()).filter((page) => !page.meta.noindex);
    },
    async children(slug) {
      const pages = await allPages();
      return pages.filter(
        (page) =>
          !page.meta.noindex &&
          page.slug.length === slug.length + 1 &&
          slugPath(page.slug.slice(0, slug.length)) === slugPath(slug),
      );
    },
    async crumbs(slug) {
      const pages = await allPages();
      return slug.map((_, index) => {
        const prefix = slug.slice(0, index + 1);
        const page = pages.find(
          (candidate) => slugPath(candidate.slug) === slugPath(prefix),
        );
        return { name: page?.crumb ?? prefix[index], href: href(prefix) };
      });
    },
  };
}

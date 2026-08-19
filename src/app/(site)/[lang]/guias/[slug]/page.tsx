import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ContentArticle } from "@/components/article/ContentArticle";
import { Faq } from "@/components/article/Faq";
import { RelatedGuides } from "@/components/guides/RelatedGuides";
import { JsonLd } from "@/components/seo/JsonLd";
import { getCategory } from "@/content/guias/categories";
import { documentHeadings, documentStats } from "@/content-system/document";
import { contentPageMetadata } from "@/content-system/metadata/page";
import {
  publicGuideBySlug,
  publiclyRenderableGuides,
  relatedGuides,
} from "@/content-system/repository/guias";
import {
  compileContent,
  contentComponents,
} from "@/content-system/render/renderContent";
import { faqPageLd, guideLd } from "@/i18n/structuredData";

// Database rows created after a deployment render on their first request. The
// static params below are only a build-time warmup, never an allowlist.
export const dynamicParams = true;

export async function generateStaticParams() {
  return (await publiclyRenderableGuides()).map((guide) => ({
    slug: guide.slug,
  }));
}

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const guide = await publicGuideBySlug(slug);
  if (!guide) return {};
  return contentPageMetadata(guide);
}

export default async function GuidePage({ params }: Props) {
  const { slug } = await params;
  const guide = await publicGuideBySlug(slug);
  if (!guide) notFound();

  const [Content, related] = await Promise.all([
    compileContent(guide.body, guide.section),
    relatedGuides(guide),
  ]);
  const categories = guide.metadata.categories
    .map(getCategory)
    .filter((category) => category !== undefined);
  const { words, minutes } = documentStats(guide);
  const faq = guide.metadata.faq ?? [];

  return (
    <ContentArticle
      title={guide.title}
      href={`/guias/${guide.slug}`}
      published={guide.publishedAt}
      updated={guide.contentUpdatedAt}
      cta={guide.cta}
      previewImage={guide.metadata.previewImage}
      categories={categories}
      headings={documentHeadings(guide)}
      minutes={minutes}
      structuredData={
        <>
          <JsonLd
            data={guideLd({
              slug: guide.slug,
              title: guide.title,
              description: guide.description,
              keywords: guide.metadata.keywords,
              published: guide.publishedAt ?? guide.contentUpdatedAt,
              updated: guide.contentUpdatedAt,
              vendor: guide.metadata.vendor,
              canonical: guide.canonicalSlug ?? undefined,
              section: categories[0]?.label,
              words,
              minutes,
            })}
          />
          {faq.length > 0 && <JsonLd data={faqPageLd(faq, "es")} />}
        </>
      }
    >
      <Content
        components={contentComponents({
          RelatedGuides: () => (
            <RelatedGuides
              guides={related.map((candidate) => ({
                slug: candidate.slug,
                title: candidate.title,
              }))}
            />
          ),
          Faq: () => <Faq items={faq} />,
        })}
      />
    </ContentArticle>
  );
}

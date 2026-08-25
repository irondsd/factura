import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { ContentArticle } from "@/components/article/ContentArticle";
import { Faq } from "@/components/article/Faq";
import { RelatedGuides } from "@/components/guides/RelatedGuides";
import { JsonLd } from "@/components/seo/JsonLd";
import { categoriesByKeys } from "@/content-system/repository/categories";
import { documentHeadings, documentStats } from "@/content-system/document";
import { contentPageMetadata } from "@/content-system/metadata/page";
import {
  guideRedirect,
  publicGuideBySlug,
  publiclyRenderableGuides,
  relatedGuides,
} from "@/content-system/repository/guias";
import { mediaComponents } from "@/content-system/media/render";
import { resolveMediaRef } from "@/content-system/media/repository";
import { resolveAuthorCredits } from "@/content-system/authors/repository";
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
  // A guide that moved keeps answering from its old address (cms.md). Asked
  // only after the miss, so a live page always wins, and 308
  // rather than 302 because the move is the editorial decision, not a
  // temporary detour.
  if (!guide) {
    const moved = await guideRedirect(slug);
    if (moved) permanentRedirect(`/guias/${moved}`);
    notFound();
  }

  const [Content, related, media, categories] = await Promise.all([
    compileContent(guide.body, guide.section),
    relatedGuides(guide),
    mediaComponents(guide.body),
    categoriesByKeys("guias", guide.metadata.categories),
  ]);
  const { words, minutes } = documentStats(guide);
  const faq = guide.metadata.faq ?? [];
  // Nothing on the page shows these yet — they exist so the article's markup
  // can name a person instead of only the organization.
  const credits = await resolveAuthorCredits(guide.metadata);

  return (
    <ContentArticle
      title={guide.title}
      href={`/guias/${guide.slug}`}
      published={guide.publishedAt}
      updated={guide.contentUpdatedAt}
      cta={guide.cta}
      previewMedia={await resolveMediaRef(guide.metadata.previewMediaId)}
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
              credits,
            })}
          />
          {faq.length > 0 && <JsonLd data={faqPageLd(faq, "es")} />}
        </>
      }
    >
      <Content
        components={contentComponents({
          // Resolved from the body in one query before this renders, so an
          // article's cost does not scale with how many images it has.
          ...media,

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

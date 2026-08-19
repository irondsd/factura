import type { Metadata } from "next";
import { ContentArticle } from "@/components/article/ContentArticle";
import { Faq } from "@/components/article/Faq";
import { RelatedGuides } from "@/components/guides/RelatedGuides";
import { JsonLd } from "@/components/seo/JsonLd";
import { getCategory } from "@/content/guias/categories";
import {
  guideHeadings,
  guideSlugs,
  guideStats,
  loadGuide,
  relatedGuides,
} from "@/content/guias/guides";
import { guideMetadata } from "@/i18n/metadata";
import { faqPageLd, guideLd } from "@/i18n/structuredData";

// One guide article. Static set only — `dynamicParams = false` 404s any slug
// that isn't a real `.mdx` file. (The Spanish-only guard lives in the layout.)
//
// Everything around the prose lives in `<ContentArticle>`, shared with the CMS
// preview so the two cannot drift (cms.md Phase 6). This route's remaining job
// is the *data*: which guide, its metadata, its structured data, and the MDX
// module Next compiled at build time. Phase 7 replaces that source with the
// repository; the shell does not change when it does.
export const dynamicParams = false;

export function generateStaticParams() {
  return guideSlugs().map((slug) => ({ slug }));
}

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const { meta } = await loadGuide(slug);
  return guideMetadata({ slug, ...meta });
}

// Rendered in Buenos Aires time, which is the offset the timestamps are authored
// in — Google requires the visible date (and time, when shown) to match the
// structured data, and the JSON-LD emits `meta.published` verbatim. 24-hour
// clock: that's how Argentina writes times.
export default async function GuidePage({ params }: Props) {
  const { slug } = await params;
  const { Content, meta } = await loadGuide(slug);
  const related = await relatedGuides(slug);
  const { words, minutes } = guideStats(slug, meta.faq);
  const headings = guideHeadings(slug, meta.faq);

  const categories = meta.categories
    .map(getCategory)
    .filter((c) => c !== undefined);

  return (
    <ContentArticle
      title={meta.title}
      href={`/guias/${slug}`}
      published={meta.published}
      updated={meta.updated}
      cta={meta.cta}
      previewImage={meta.preview}
      categories={categories}
      headings={headings}
      minutes={minutes}
      structuredData={
        <>
          <JsonLd
            data={guideLd({
              slug,
              ...meta,
              section: categories[0]?.label,
              words,
              minutes,
            })}
          />
          {/* Only when the guide actually renders the questions below —
              FAQPage markup for Q&A a visitor can't see on the page is a spam
              signal, and binding both to `meta.faq` is what makes that
              impossible here. */}
          {meta.faq && meta.faq.length > 0 && (
            <JsonLd data={faqPageLd(meta.faq, "es")} />
          )}
        </>
      }
    >
      {/* `RelatedGuides` and `Faq` are overridden here rather than in
          mdx-components.tsx: the global map can't know which guide is
          rendering, so the page binds the resolved data and the MDX just places
          a bare tag where the author wants it. */}
      <Content
        components={{
          RelatedGuides: () => (
            <RelatedGuides
              guides={related.map((g) => ({
                slug: g.slug,
                title: g.meta.title,
              }))}
            />
          ),
          Faq: () => <Faq items={meta.faq ?? []} />,
        }}
      />
    </ContentArticle>
  );
}

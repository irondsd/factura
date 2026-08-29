import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ContentArticle } from "@/components/article/ContentArticle";
import { Faq } from "@/components/article/Faq";
import { Fuentes } from "@/components/section/Fuentes";
import { JsonLd } from "@/components/seo/JsonLd";
import { noticias } from "@/content/sections";
import { documentHeadings, documentStats } from "@/content-system/document";
import { mediaComponents } from "@/content-system/media/render";
import { resolveMediaRef } from "@/content-system/media/repository";
import { resolveAuthorCredits } from "@/content-system/authors/repository";
import { contentComponents } from "@/content-system/render/renderContent";
import { categoriesByKeys } from "@/content-system/repository/categories";
import { sectionMetadata } from "@/i18n/metadata";
import { editorialPageLd, faqPageLd } from "@/i18n/structuredData";
import { spanishOnly } from "@/i18n/routing";
import { locationsByKeys } from "@/content-system/repository/locations";

export const dynamicParams = true;
export function generateStaticParams() {
  return spanishOnly(async () =>
    (await noticias.slugs()).map(([slug]) => ({ slug })),
  );
}
type Props = { params: Promise<{ slug: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const page = await noticias.load([slug]);
  return page
    ? sectionMetadata({ id: noticias.id, slug: [slug], ...page.meta })
    : {};
}
export default async function NoticiaPage({ params }: Props) {
  const { slug } = await params;
  const page = await noticias.load([slug]);
  if (!page) notFound();
  const { document, meta, Content } = page;
  const categories = await categoriesByKeys("noticias", meta.categoryKeys);
  const locations = await locationsByKeys(document.metadata.locations);
  const { words, minutes } = documentStats(document);
  const faq = meta.faq ?? [];
  // Not displayed yet — they only reach the article's structured data.
  const credits = await resolveAuthorCredits(document.metadata);
  return (
    <ContentArticle
      title={meta.title}
      href={noticias.href([slug])}
      published={document.publishedAt}
      updated={document.contentUpdatedAt}
      cta={meta.cta}
      previewMedia={await resolveMediaRef(meta.previewMediaId)}
      credits={credits}
      headings={documentHeadings(document)}
      minutes={minutes}
      categories={categories}
      locations={locations}
      section={{
        id: "noticias",
        label: "Noticias",
        singular: "Noticia",
        href: noticias.base,
        tocLabel: "En esta noticia",
        backLabel: noticias.backLabel,
      }}
      structuredData={
        <>
          <JsonLd
            data={editorialPageLd({
              id: noticias.id,
              slug: [slug],
              title: meta.title,
              description: meta.description,
              keywords: meta.keywords,
              published: meta.published,
              updated: meta.updated,
              words,
              minutes,
              credits,
              locations,
            })}
          />
          {faq.length > 0 && <JsonLd data={faqPageLd(faq, "es")} />}
        </>
      }
    >
      <Content
        components={contentComponents({
          ...(await mediaComponents(document.body)),
          Faq: () => <Faq items={faq} />,
          // As in guides, and unlike the data sections: the list, without the
          // licence paragraph — an article publishes no table of its own.
          Fuentes: () => <Fuentes items={document.metadata.sources ?? []} />,
        })}
      />
    </ContentArticle>
  );
}

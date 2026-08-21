import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ContentArticle } from "@/components/article/ContentArticle";
import { Faq } from "@/components/article/Faq";
import { JsonLd } from "@/components/seo/JsonLd";
import { noticias } from "@/content/sections";
import { documentHeadings, documentStats } from "@/content-system/document";
import { mediaComponents } from "@/content-system/media/render";
import { resolveMediaRef } from "@/content-system/media/repository";
import { contentComponents } from "@/content-system/render/renderContent";
import { sectionMetadata } from "@/i18n/metadata";
import { editorialPageLd, faqPageLd } from "@/i18n/structuredData";

export const dynamicParams = true;
export async function generateStaticParams() {
  return (await noticias.slugs()).map(([slug]) => ({ slug }));
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
  const { words, minutes } = documentStats(document);
  const faq = meta.faq ?? [];
  return (
    <ContentArticle
      title={meta.title}
      href={noticias.href([slug])}
      published={document.publishedAt}
      updated={document.contentUpdatedAt}
      cta={meta.cta}
      previewMedia={await resolveMediaRef(meta.previewMediaId)}
      headings={documentHeadings(document)}
      minutes={minutes}
      section={{
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
        })}
      />
    </ContentArticle>
  );
}

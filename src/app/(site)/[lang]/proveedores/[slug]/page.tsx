import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { ContentArticle } from "@/components/article/ContentArticle";
import { Faq } from "@/components/article/Faq";
import { RelatedGuides } from "@/components/guides/RelatedGuides";
import { bindProviderComponents } from "@/components/proveedores/bindProviderComponents";
import { Fuentes } from "@/components/section/Fuentes";
import { Metodologia } from "@/components/section/Metodologia";
import { JsonLd } from "@/components/seo/JsonLd";
import { proveedores } from "@/content/sections";
import { documentHeadings, documentStats } from "@/content-system/document";
import { mediaComponents } from "@/content-system/media/render";
import { resolveMediaRef } from "@/content-system/media/repository";
import { resolveAuthorCredits } from "@/content-system/authors/repository";
import { contentComponents } from "@/content-system/render/renderContent";
import { categoriesByKeys } from "@/content-system/repository/categories";
import { guidesForVendor } from "@/content-system/repository/guias";
import { locationsByKeys } from "@/content-system/repository/locations";
import { sectionMetadata } from "@/i18n/metadata";
import { editorialPageLd, faqPageLd } from "@/i18n/structuredData";
import { spanishOnly } from "@/i18n/routing";

// One company: /proveedores/edesur. The guide reading experience — same shell,
// same components — with the company's services as its categories and its
// guides (matched on `vendor`) behind <RelatedGuides />.
//
// Flat for now. The section model underneath already supports children, so a
// /proveedores/edesur/reclamos later is a route change, not a data one.

// Database rows created after a deployment render on their first request. The
// static params below are only a build-time warmup, never an allowlist.
export const dynamicParams = true;

export function generateStaticParams() {
  return spanishOnly(async () =>
    (await proveedores.slugs())
      .filter((slug) => slug.length === 1)
      .map(([slug]) => ({ slug })),
  );
}

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const page = await proveedores.load([slug]);
  return page
    ? sectionMetadata({ id: proveedores.id, slug: [slug], ...page.meta })
    : {};
}

export default async function ProveedorPage({ params }: Props) {
  const { slug } = await params;
  const page = await proveedores.load([slug]);
  // A renamed company page keeps answering from its old address, as guides do.
  if (!page) {
    const moved = await proveedores.redirect([slug]);
    if (moved) permanentRedirect(proveedores.href(moved));
    notFound();
  }

  const { document, meta, Content } = page;
  const vendor = document.metadata.vendor;
  const [categories, locations, guides, media, credits, providerComponents] =
    await Promise.all([
      categoriesByKeys("proveedores", meta.categoryKeys),
      locationsByKeys(document.metadata.locations),
      guidesForVendor(vendor),
      mediaComponents(document.body),
      resolveAuthorCredits(document.metadata),
      bindProviderComponents(document),
    ]);
  const { words, minutes } = documentStats(document);
  const faq = meta.faq ?? [];

  return (
    <ContentArticle
      title={meta.title}
      href={proveedores.href([slug])}
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
        id: "proveedores",
        label: "Proveedores",
        singular: "Proveedor",
        href: proveedores.base,
        tocLabel: "En esta página",
        backLabel: proveedores.backLabel,
      }}
      structuredData={
        <>
          <JsonLd
            data={editorialPageLd({
              id: proveedores.id,
              slug: [slug],
              type: "Article",
              title: meta.title,
              description: meta.description,
              keywords: meta.keywords,
              published: meta.published,
              updated: meta.updated,
              vendor,
              section: categories[0]?.label,
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
          ...media,
          ProviderSummary: providerComponents.ProviderSummary,
          Opiniones: providerComponents.Opiniones,
          RelatedGuides: () => (
            <RelatedGuides
              guides={guides.map((guide) => ({
                slug: guide.slug,
                title: guide.title,
              }))}
            />
          ),
          Faq: () => <Faq items={faq} />,
          Metodologia: () => (
            <Metodologia value={document.metadata.methodology} />
          ),
          // As in guides: the list, without the licence paragraph — a company
          // page publishes no table of its own.
          Fuentes: () => <Fuentes items={document.metadata.sources ?? []} />,
        })}
      />
    </ContentArticle>
  );
}

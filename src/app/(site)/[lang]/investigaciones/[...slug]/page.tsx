import type { Metadata } from "next";
import { SectionArticle } from "@/components/section/SectionArticle";
import { investigaciones } from "@/content/sections";
import { sectionMetadata } from "@/i18n/metadata";

// One research page, at any depth. The registry in
// CMS pages render on demand, so newly published content does not need a
// deployment before its URL becomes available.
//
// The body is `<SectionArticle />`, shared with /estadisticas.
export const dynamicParams = true;

export async function generateStaticParams() {
  return (await investigaciones.slugs()).map((slug) => ({ slug }));
}

type Props = { params: Promise<{ slug: string[] }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const page = await investigaciones.load(slug);
  if (!page) return {};
  return sectionMetadata({ id: investigaciones.id, slug, ...page.meta });
}

export default async function InvestigacionPage({ params }: Props) {
  const { slug } = await params;
  return <SectionArticle section={investigaciones} slug={slug} />;
}

import type { Metadata } from "next";
import { SectionArticle } from "@/components/section/SectionArticle";
import { investigacion } from "@/content/sections";
import { sectionMetadata } from "@/i18n/metadata";

// One research page, at any depth. The registry in
// CMS pages render on demand, so newly published content does not need a
// deployment before its URL becomes available.
//
// The body is `<SectionArticle />`, shared with /estadisticas.
export const dynamicParams = true;

export function generateStaticParams() {
  return investigacion.slugs().map((slug) => ({ slug }));
}

type Props = { params: Promise<{ slug: string[] }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const page = await investigacion.load(slug);
  if (!page) return {};
  return sectionMetadata({ id: investigacion.id, slug, ...page.meta });
}

export default async function InvestigacionPage({ params }: Props) {
  const { slug } = await params;
  return <SectionArticle section={investigacion} slug={slug} />;
}

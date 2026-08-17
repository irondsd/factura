import type { Metadata } from "next";
import { SectionArticle } from "@/components/section/SectionArticle";
import { investigacion } from "@/content/investigacion/pages";
import { sectionMetadata } from "@/i18n/metadata";

// One research page, at any depth. The registry in
// `content/investigacion/pages.ts` is the whole set, so a catch-all with
// `dynamicParams = false` 404s anything else.
//
// The body is `<SectionArticle />`, shared with /estadisticas.
export const dynamicParams = false;

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

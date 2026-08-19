import type { Metadata } from "next";
import { SectionArticle } from "@/components/section/SectionArticle";
import { estadisticas } from "@/content/estadisticas/pages";
import { sectionMetadata } from "@/i18n/metadata";

// One statistics page, at any depth: /estadisticas/delitos-caba today,
// /estadisticas/alquiler/caba the day a statistic gets per-district pages. The
// registry in `content/estadisticas/pages.ts` is the whole set, so a catch-all
// with `dynamicParams = false` 404s anything else.
//
// The body is `<SectionArticle />`, shared with /investigacion.
export const dynamicParams = true;

export function generateStaticParams() {
  return estadisticas.slugs().map((slug) => ({ slug }));
}

type Props = { params: Promise<{ slug: string[] }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const page = await estadisticas.load(slug);
  if (!page) return {};
  return sectionMetadata({ id: estadisticas.id, slug, ...page.meta });
}

export default async function EstadisticaPage({ params }: Props) {
  const { slug } = await params;
  return <SectionArticle section={estadisticas} slug={slug} />;
}

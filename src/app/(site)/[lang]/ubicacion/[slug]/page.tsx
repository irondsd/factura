import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { Breadcrumbs } from "@/components/article/Breadcrumbs";
import { ContentList } from "@/components/article/ContentList";
import { Eyebrow, SHELL } from "@/components/landing/parts";
import { JsonLd } from "@/components/seo/JsonLd";
import { CMS_SECTIONS } from "@/cms/sections";
import {
  contentInLocation, locationBySlug, locationRedirect, nonEmptyContentLocations,
} from "@/content-system/repository/locations";
import type { ContentSection } from "@/content-system/types";
import { locationMetadata } from "@/i18n/metadata";
import { locationHubLd } from "@/i18n/structuredData";
import { spanishOnly } from "@/i18n/routing";

export const dynamicParams = true;
export function generateStaticParams() { return spanishOnly(async () => (await nonEmptyContentLocations()).map((location) => ({ slug: location.slug }))); }
type Props = { params: Promise<{ slug: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> { const location = await locationBySlug((await params).slug); return location ? locationMetadata(location) : {}; }

export default async function LocationHubPage({ params }: Props) {
  const { slug } = await params;
  const location = await locationBySlug(slug);
  if (!location) { const moved = await locationRedirect(slug); if (moved) permanentRedirect(`/ubicacion/${moved.slug}`); notFound(); }
  const groups = await contentInLocation(location.key);
  const ordered = CMS_SECTIONS.map((section) => ({ section, pages: groups[section.id] })).filter((group) => group.pages.length);
  if (!ordered.length) notFound();
  const pages = ordered.flatMap(({ pages }) => pages);
  return <>
    <JsonLd data={locationHubLd({ location, pages: pages.map((page) => ({ section: page.section, slug: page.slug, title: page.title })) })} />
    <main className={SHELL}>
      <Breadcrumbs className="pt-10" items={[{ name: "Inicio", href: "/" }, { name: "Ubicaciones", href: "/ubicacion" }, { name: location.label, href: `/ubicacion/${location.slug}` }]} />
      <header className="max-w-[680px] pt-7 pb-2"><Eyebrow tone="accent">Ubicación</Eyebrow><h1 className="mt-[18px] mb-0 font-display text-[36px] leading-[1.05] font-semibold tracking-[-0.025em] sm:text-[46px]">{location.title}</h1><p className="mt-[18px] mb-0 font-mono text-[15px] leading-[1.7] text-muted">{location.description}</p></header>
      <div className="mt-12 mb-16 flex flex-col gap-12">{ordered.map(({ section, pages }) => <section key={section.id}>
        <div className="flex items-baseline justify-between gap-4 border-b border-line pb-3"><h2 className="m-0 font-display text-[24px] font-semibold tracking-[-0.02em] sm:text-[27px]">{section.label}</h2><Eyebrow>{pages.length} {pages.length === 1 ? section.singular.toLowerCase() : plural(section.id)}</Eyebrow></div>
        <ContentList titleAs="h3" datePrefix="Actualizado el " items={pages.map((page) => ({ key: page.id, href: `/${page.section}/${page.slug}`, title: page.title, summary: page.summary, previewMediaId: page.metadata.previewMediaId, date: page.contentUpdatedAt }))} />
      </section>)}</div>
      <nav className="mb-16"><Link href="/ubicacion" className="font-mono text-micro tracking-label-wide text-muted uppercase no-underline hover:text-accent">← Todas las ubicaciones</Link></nav>
    </main>
  </>;
}

function plural(section: ContentSection): string { return section === "guias" ? "guías" : section === "noticias" ? "noticias" : section === "estadisticas" ? "estadísticas" : "investigaciones"; }

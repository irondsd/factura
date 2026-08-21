import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/article/Breadcrumbs";
import { ContentList } from "@/components/article/ContentList";
import { SHELL } from "@/components/landing/parts";
import { JsonLd } from "@/components/seo/JsonLd";
import { noticias } from "@/content/sections";
import { sectionIndexMetadata } from "@/i18n/metadata";
import { sectionIndexLd } from "@/i18n/structuredData";

const TITLE = "Noticias sobre facturas y costo de vida";
const DESCRIPTION = "Novedades sobre Factura, las facturas del hogar y los cambios que afectan el costo de vida en Argentina.";
const INTRO = "Actualizaciones y contexto sobre las facturas del hogar, los datos que las explican y las novedades de Factura.";

export function generateMetadata(): Metadata {
  return sectionIndexMetadata({ id: noticias.id, title: TITLE, description: DESCRIPTION });
}

export default async function NoticiasIndexPage() {
  const pages = await noticias.listed();
  return (
    <>
      <JsonLd data={sectionIndexLd({ id: noticias.id, title: TITLE, description: DESCRIPTION, pages: pages.map((p) => ({ slug: p.slug, title: p.meta.title })) })} />
      <main className={SHELL}>
        <Breadcrumbs className="pt-10" items={[{ name: "Inicio", href: "/" }, { name: "Noticias", href: "/noticias" }]} />
        <header className="max-w-[640px] pt-7 pb-2">
          <h1 className="font-display font-semibold text-[36px] sm:text-[46px] tracking-[-0.025em] leading-[1.05] mt-0 mb-0">{TITLE}</h1>
          <p className="font-mono text-[15px] leading-[1.7] text-muted mt-[18px] mb-0">{INTRO}</p>
        </header>
        <div className="mt-12 mb-16 border-t border-line">
          <ContentList items={pages.map((page) => ({ key: noticias.href(page.slug), href: noticias.href(page.slug), title: page.meta.title, summary: page.meta.summary, previewMediaId: page.meta.previewMediaId, date: page.meta.published }))} />
        </div>
      </main>
    </>
  );
}

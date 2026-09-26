import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/article/Breadcrumbs";
import { ContentList } from "@/components/article/ContentList";
import { CategoryChips } from "@/components/guides/CategoryChips";
import { Eyebrow, SHELL } from "@/components/landing/parts";
import { JsonLd } from "@/components/seo/JsonLd";
import { proveedores } from "@/content/sections";
import {
  contentByPrimaryCategory,
  nonEmptyContentCategories,
} from "@/content-system/repository/categories";
import { sectionIndexMetadata } from "@/i18n/metadata";
import { sectionIndexLd } from "@/i18n/structuredData";
import { spanishIndexParams } from "@/i18n/routing";

// Spanish-only: prerender /es alone, never an English 404 (see
// `spanishIndexParams`).
export const dynamicParams = false;
export const generateStaticParams = spanishIndexParams;

// The directory of companies, grouped by the service each one leads with — the
// primary category, as on /guias, so a company selling four services appears
// once. Every company is listed: this is a directory a reader scans for one
// name, and a "ver los N" button between them and it would only be in the way.

const TITLE = "Proveedores de servicios del hogar";
const DESCRIPTION =
  "Qué ofrece cada empresa de luz, gas, agua, internet y telefonía en Argentina, dónde presta el servicio y cómo leer y pagar sus facturas.";
const INTRO =
  "Una página por empresa: qué servicios presta, en qué zonas y todo lo que publicamos sobre sus facturas.";

export function generateMetadata(): Metadata {
  return sectionIndexMetadata({
    id: proveedores.id,
    title: TITLE,
    description: DESCRIPTION,
  });
}

export default async function ProveedoresIndexPage() {
  const [pages, groups, categories] = await Promise.all([
    proveedores.listed(),
    contentByPrimaryCategory("proveedores"),
    nonEmptyContentCategories("proveedores"),
  ]);

  return (
    <>
      <JsonLd
        data={sectionIndexLd({
          id: proveedores.id,
          title: TITLE,
          description: DESCRIPTION,
          pages: pages.map((p) => ({ slug: p.slug, title: p.meta.title })),
        })}
      />
      <main className={SHELL}>
        <Breadcrumbs
          className="pt-10"
          items={[
            { name: "Inicio", href: "/" },
            { name: "Proveedores", href: proveedores.base },
          ]}
        />
        <header className="max-w-[640px] pt-7 pb-2">
          <h1 className="font-display font-semibold text-[36px] sm:text-[46px] tracking-[-0.025em] leading-[1.05] mt-0 mb-0">
            {TITLE}
          </h1>
          <p className="font-mono text-[15px] leading-[1.7] text-muted mt-[18px] mb-0">
            {INTRO}
          </p>
        </header>

        <CategoryChips
          categories={categories}
          section="proveedores"
          label="Servicios"
          className="mt-8"
        />

        <div className="mt-14 mb-16 flex flex-col gap-14">
          {groups
            .filter((group) => group.pages.length > 0)
            .map(({ category, pages: shown }) => (
              <section key={category.id}>
                <div className="flex items-baseline justify-between gap-4 border-b border-line pb-3">
                  <h2 className="font-display font-semibold text-[24px] sm:text-[27px] tracking-[-0.02em] text-ink m-0">
                    {category.label}
                  </h2>
                  <Eyebrow className="flex-none">
                    {shown.length}{" "}
                    {shown.length === 1 ? "proveedor" : "proveedores"}
                  </Eyebrow>
                </div>
                <ContentList
                  titleAs="h3"
                  datePrefix="Actualizado el "
                  items={[...shown]
                    .sort((a, b) => a.title.localeCompare(b.title, "es"))
                    .map((page) => {
                      const slug = page.slug.split("/");
                      return {
                        key: page.slug,
                        href: proveedores.href(slug),
                        title: page.title,
                        summary: page.summary,
                        previewMediaId: page.metadata.previewMediaId,
                        date: page.contentUpdatedAt,
                      };
                    })}
                />
              </section>
            ))}
        </div>
      </main>
    </>
  );
}

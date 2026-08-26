import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { Breadcrumbs } from "@/components/article/Breadcrumbs";
import { ContentList } from "@/components/article/ContentList";
import { Eyebrow, SHELL } from "@/components/landing/parts";
import { JsonLd } from "@/components/seo/JsonLd";
import {
  categoryBySlug,
  categoryRedirect,
  contentInCategory,
} from "@/content-system/repository/categories";
import type { ContentSection } from "@/content-system/types";
import { contentCategoryLd } from "@/i18n/structuredData";

const SECTION_COPY: Record<
  Exclude<ContentSection, "guias">,
  { label: string; backLabel: string }
> = {
  noticias: { label: "Noticias", backLabel: "Todas las noticias" },
  estadisticas: {
    label: "Estadísticas",
    backLabel: "Todas las estadísticas",
  },
  investigaciones: {
    label: "Investigaciones",
    backLabel: "Todas las investigaciones",
  },
};

export async function CategoryHub({
  section,
  slug,
}: {
  section: Exclude<ContentSection, "guias">;
  slug: string;
}) {
  const copy = SECTION_COPY[section];
  const category = await categoryBySlug(section, slug);
  if (!category) {
    const moved = await categoryRedirect(section, slug);
    if (moved) permanentRedirect(`/${section}/categoria/${moved.slug}`);
    notFound();
  }

  const pages = await contentInCategory(section, category.key);
  if (pages.length === 0) notFound();

  return (
    <>
      <JsonLd
        data={contentCategoryLd({
          section,
          slug: category.slug,
          title: category.title,
          description: category.description,
          pages: pages.map((page) => ({
            slug: page.slug,
            title: page.title,
          })),
        })}
      />

      <main className={SHELL}>
        <Breadcrumbs
          className="pt-10"
          items={[
            { name: "Inicio", href: "/" },
            { name: copy.label, href: `/${section}` },
            {
              name: category.label,
              href: `/${section}/categoria/${category.slug}`,
            },
          ]}
        />

        <header className="max-w-[640px] pt-7 pb-2">
          <Eyebrow tone="accent">Tema</Eyebrow>
          <h1 className="mt-[18px] mb-0 font-display text-[34px] leading-[1.06] font-semibold tracking-[-0.025em] sm:text-[44px]">
            {category.title}
          </h1>
          <p className="mt-[18px] mb-0 font-mono text-[15px] leading-[1.7] text-muted">
            {category.description}
          </p>
        </header>

        <div className="mt-12 border-t border-line">
          <ContentList
            datePrefix="Actualizado el "
            items={pages.map((page) => ({
              key: page.id,
              href: `/${section}/${page.slug}`,
              title: page.title,
              summary: page.summary,
              previewMediaId: page.metadata.previewMediaId,
              date: page.contentUpdatedAt,
            }))}
          />
        </div>

        <nav className="mt-10 mb-16">
          <Link
            href={`/${section}`}
            className="font-mono text-micro tracking-label-wide text-muted uppercase no-underline transition-colors hover:text-accent"
          >
            ← {copy.backLabel}
          </Link>
        </nav>
      </main>
    </>
  );
}

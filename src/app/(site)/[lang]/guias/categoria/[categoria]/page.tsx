import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/article/Breadcrumbs";
import { GuideList } from "@/components/guides/GuideList";
import { Eyebrow, SHELL } from "@/components/landing/parts";
import { JsonLd } from "@/components/seo/JsonLd";
import { getCategory } from "@/content/guias/categories";
import {
  guidesInCategory,
  nonEmptyCategories,
} from "@/content-system/repository/guias";
import { guideCategoryMetadata } from "@/i18n/metadata";
import { guideCategoryLd } from "@/i18n/structuredData";

// One category hub, e.g. /guias/categoria/expensas. Lists every guide *tagged*
// with the category — a superset of the category's section on the index, which
// only shows the guides that lead with it.
//
// `categoria` is a static segment, so it takes precedence over the sibling
// `[slug]` route and can never be shadowed by a guide. (`validate-guides.ts`
// reserves the slug so nobody creates the collision from the other side.)
export const dynamicParams = false;

export async function generateStaticParams() {
  // Categories with no guides at all are skipped: an empty hub is a thin page
  // for Google and a dead end for readers.
  return (await nonEmptyCategories()).map((c) => ({ categoria: c.id }));
}

type Props = { params: Promise<{ categoria: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { categoria } = await params;
  const category = getCategory(categoria);
  if (!category) return {};
  return guideCategoryMetadata({
    id: category.id,
    title: category.title,
    description: category.description,
  });
}

export default async function GuideCategoryPage({ params }: Props) {
  const { categoria } = await params;
  const category = getCategory(categoria);
  if (!category) notFound();

  const guides = await guidesInCategory(category.id);

  return (
    <>
      <JsonLd
        data={guideCategoryLd({
          id: category.id,
          title: category.title,
          description: category.description,
          guides: guides.map((g) => ({ slug: g.slug, title: g.title })),
        })}
      />

      <main className={SHELL}>
        <Breadcrumbs
          className="pt-10"
          items={[
            { name: "Inicio", href: "/" },
            { name: "Guías", href: "/guias" },
            { name: category.label, href: `/guias/categoria/${category.id}` },
          ]}
        />

        <header className="max-w-[640px] pt-7 pb-2">
          <Eyebrow tone="accent">Tema</Eyebrow>
          <h1 className="font-display font-semibold text-[34px] sm:text-[44px] tracking-[-0.025em] leading-[1.06] mt-[18px] mb-0">
            {category.title}
          </h1>
          <p className="font-mono text-[15px] leading-[1.7] text-muted mt-[18px] mb-0">
            {category.description}
          </p>
        </header>

        <div className="mt-12 border-t border-line">
          <GuideList guides={guides} />
        </div>

        <nav className="mt-10 mb-16">
          <Link
            href="/guias"
            className="font-mono text-micro uppercase tracking-label-wide text-muted no-underline transition-colors hover:text-accent"
          >
            ← Todas las guías
          </Link>
        </nav>
      </main>
    </>
  );
}

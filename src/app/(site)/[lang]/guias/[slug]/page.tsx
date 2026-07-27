import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs } from "@/components/guides/Breadcrumbs";
import { CategoryChips } from "@/components/guides/CategoryChips";
import { RelatedGuides } from "@/components/guides/RelatedGuides";
import { Eyebrow, SHELL } from "@/components/landing/parts";
import { JsonLd } from "@/components/seo/JsonLd";
import { getCategory } from "@/content/guias/categories";
import { guideSlugs, loadGuide, relatedGuides } from "@/content/guias/guides";
import { guideMetadata } from "@/i18n/metadata";
import { guideLd } from "@/i18n/structuredData";

// One guide article. Static set only — `dynamicParams = false` 404s any slug
// that isn't a real `.mdx` file. (The Spanish-only guard lives in the layout.)
export const dynamicParams = false;

export function generateStaticParams() {
  return guideSlugs().map((slug) => ({ slug }));
}

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const { meta } = await loadGuide(slug);
  return guideMetadata({ slug, ...meta });
}

const fmtDate = (iso: string) =>
  new Intl.DateTimeFormat("es-AR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(iso));

export default async function GuidePage({ params }: Props) {
  const { slug } = await params;
  const { Content, meta } = await loadGuide(slug);
  const related = await relatedGuides(slug);

  // Categories in the order the guide declares them: primary first, which is
  // also the one that earns the breadcrumb crumb.
  const categories = meta.categories
    .map(getCategory)
    .filter((c) => c !== undefined);
  const primary = categories[0];

  return (
    <>
      <JsonLd data={guideLd({ slug, ...meta })} />

      <main className={SHELL}>
        <article className="max-w-[680px] pt-10 pb-16">
          <Breadcrumbs
            className="mb-7"
            items={[
              { name: "Inicio", href: "/" },
              { name: "Guías", href: "/guias" },
              ...(primary
                ? [
                    {
                      name: primary.label,
                      href: `/guias/categoria/${primary.id}`,
                    },
                  ]
                : []),
              { name: meta.title, href: `/guias/${slug}` },
            ]}
          />

          <header className="pb-2">
            <Eyebrow tone="accent">Guía</Eyebrow>
            <h1 className="font-display font-semibold text-[34px] sm:text-[44px] tracking-[-0.025em] leading-[1.06] mt-[18px] mb-0">
              {meta.title}
            </h1>
            <p className="font-mono text-micro uppercase tracking-label-wide text-muted mt-5">
              Publicado el {fmtDate(meta.published)}
              {meta.updated !== meta.published &&
                ` · Actualizado el ${fmtDate(meta.updated)}`}
            </p>
            <CategoryChips
              categories={categories}
              label="Temas de esta guía"
              className="mt-5"
            />
          </header>

          <div className="mt-8 border-t border-line pt-2">
            {/* `RelatedGuides` is overridden here rather than in
                mdx-components.tsx: the global map can't know which guide is
                rendering, so the page binds the resolved list and the MDX just
                places a bare <RelatedGuides /> where the author wants it. */}
            <Content
              components={{
                RelatedGuides: () => <RelatedGuides guides={related} />,
              }}
            />
          </div>

          <nav className="mt-14 border-t border-line pt-6">
            <Link
              href="/guias"
              className="font-mono text-micro uppercase tracking-label-wide text-muted no-underline transition-colors hover:text-accent"
            >
              ← Todas las guías
            </Link>
          </nav>
        </article>
      </main>
    </>
  );
}

import { notFound } from "next/navigation";
import Link from "next/link";
import { ArticlePreview } from "@/components/article/ArticlePreview";
import { Breadcrumbs } from "@/components/article/Breadcrumbs";
import { Faq } from "@/components/article/Faq";
import { TocInline, TocSidebar } from "@/components/article/Toc";
import { Fuentes } from "@/components/section/Fuentes";
import { SectionList } from "@/components/section/SectionList";
import { AsideCta, TopCta } from "@/components/guides/cta";
import { Eyebrow, SHELL } from "@/components/landing/parts";
import { JsonLd } from "@/components/seo/JsonLd";
import type { ContentSection } from "@/content/section";
import { faqPageLd, sectionPageLd } from "@/i18n/structuredData";
import { formatContentDateTime } from "@/lib/content-date";
import { contentComponents } from "@/content-system/render/renderContent";
import { documentHeadings, documentStats } from "@/content-system/document";

// One page of a registry section, at any depth: /estadisticas/delitos-caba,
// /investigacion/barrios-seguros-baratos-caba, and
// /estadisticas/alquiler/caba the day a subject grows per-district pages.
//
// The whole body of the article route, so the two sections' `page.tsx` files are
// `generateStaticParams` plus a call to this. Structurally it is the guide
// article route with three differences, each of which is what these sections are
// rather than a variation on them: the slug is a path (so the breadcrumb trail
// is walked, not composed by hand), the dateline leads with *updated* (a series
// is only as good as its last point), and a page with child pages can list them,
// wherever its prose puts `<Subpaginas />`.

export async function SectionArticle({
  section,
  slug,
}: {
  section: ContentSection;
  slug: string[];
}) {
  const page = await section.load(slug);
  // `dynamicParams = false` means this can't be reached in a build, but the
  // route's types don't know that and neither would a stale prerender.
  if (!page) notFound();

  const { Content, meta, document } = page;
  const [crumbs, children] = await Promise.all([
    section.crumbs(slug),
    section.children(slug),
  ]);
  // The registry is retained as a rollback fixture during the migration, but a
  // newly authored CMS page has no source file. Its reading time and table of
  // contents therefore come from the same stored document `load()` already
  // resolved the body from — asking the database a second time here would be
  // both a duplicate query and a chance for the two to disagree.
  const { words, minutes } = document
    ? documentStats(document)
    : section.readingStats(slug, meta.faq);
  const headings = document
    ? documentHeadings(document)
    : section.headings(slug, meta.faq);

  return (
    <>
      <JsonLd
        data={sectionPageLd({ id: section.id, slug, ...meta, words, minutes })}
      />
      {/* Only when the page actually renders the questions below — FAQPage
          markup for Q&A a visitor can't see is a spam signal, and binding both
          to `meta.faq` is what makes that impossible here. */}
      {meta.faq && meta.faq.length > 0 && (
        <JsonLd data={faqPageLd(meta.faq, "es")} />
      )}

      <main className={SHELL}>
        {/* Two columns from `lg` up, where the shell is wide enough for the
            article, a 40px gutter and the 220px contents. Below that the aside
            renders nothing and this is the single column it always was. */}
        <div className="flex gap-10">
          {/* Wider than a guide's 680px: these pages are mostly figures, and a
              chart with seventy-eight columns wants every pixel it can get. */}
          <article className="w-full min-w-0 max-w-[760px] pt-10 pb-16">
            <Breadcrumbs
              className="mb-7"
              items={[
                { name: "Inicio", href: "/" },
                { name: section.label, href: section.base },
                ...crumbs,
              ]}
            />

            {/* The phone's copy of the illustration: full width above the
                headline. From `lg` up the sidebar's copy shows instead, so this
                one is hidden rather than duplicated on screen. */}
            {meta.preview && (
              <ArticlePreview src={meta.preview} className="mb-7 lg:hidden" />
            )}

            <header className="pb-2">
              <Eyebrow tone="accent">{section.label}</Eyebrow>
              <h1 className="font-display font-semibold text-[34px] sm:text-[44px] tracking-[-0.025em] leading-[1.06] mt-[18px] mb-0">
                {meta.title}
              </h1>
              {/* Updated first, published second — the reverse of a guide. On a
                  page whose whole claim is "these are the current numbers", the
                  date of the last data point is the headline fact and the
                  original publication date is provenance. */}
              <p className="flex flex-wrap gap-x-2 gap-y-1 font-mono text-micro uppercase tracking-label-wide text-muted mt-5">
                <span>
                  Actualizado el{" "}
                  <time dateTime={meta.updated}>
                    {formatContentDateTime(meta.updated)}
                  </time>
                  <span aria-hidden="true"> ·</span>
                </span>
                {meta.updated !== meta.published && (
                  <span>
                    Publicado el{" "}
                    <time dateTime={meta.published}>
                      {formatContentDateTime(meta.published)}
                    </time>
                    <span aria-hidden="true"> ·</span>
                  </span>
                )}
                <span>{minutes} min de lectura</span>
              </p>
            </header>

            <TopCta>{meta.cta}</TopCta>

            <TocInline headings={headings} label="En esta página" />

            <div className="mt-8 border-t border-line pt-2">
              {/* Bound here rather than in mdx-components.tsx: the global map
                  can't know which page is rendering, so the route injects the
                  resolved content and the MDX just places a bare tag where the
                  author wants it. */}
              <Content
                components={contentComponents({
                  Faq: () => <Faq items={meta.faq ?? []} />,
                  Fuentes: () => <Fuentes items={meta.sources} />,
                  // A hub page places its own children where its prose wants
                  // them, under its own heading — see AUTHORING.md §4. Renders
                  // nothing on a page that has none, so a leaf can carry the tag
                  // harmlessly and a hub that forgets it is the author's call
                  // rather than a layout accident.
                  Subpaginas: () =>
                    children.length > 0 ? (
                      <SectionList
                        section={section}
                        pages={children}
                        titleAs="h3"
                      />
                    ) : null,
                })}
              />
            </div>

            <nav className="mt-14 border-t border-line pt-6">
              <Link
                href={section.base}
                className="font-mono text-micro uppercase tracking-label-wide text-muted no-underline transition-colors hover:text-accent"
              >
                {section.backLabel}
              </Link>
            </nav>
          </article>

          {/* The gutter carries the contents *and* the standing offer: these
              pages are long enough that a reader who stops at the map is five
              screens from the closing CTA and has left the top one behind. */}
          <TocSidebar
            headings={headings}
            label="En esta página"
            above={meta.preview && <ArticlePreview src={meta.preview} />}
            below={<AsideCta />}
          />
        </div>
      </main>
    </>
  );
}

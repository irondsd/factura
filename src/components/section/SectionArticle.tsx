import { notFound, permanentRedirect } from "next/navigation";
import Link from "next/link";
import { ArticleByline } from "@/components/article/ArticleByline";
import { ArticleDateline } from "@/components/article/ArticleDateline";
import { ArticlePreview } from "@/components/article/ArticlePreview";
import { Breadcrumbs } from "@/components/article/Breadcrumbs";
import { Faq } from "@/components/article/Faq";
import { TocInline, TocSidebar } from "@/components/article/Toc";
import { Fuentes } from "@/components/section/Fuentes";
import { SectionList } from "@/components/section/SectionList";
import { CategoryChips } from "@/components/guides/CategoryChips";
import { AsideCta, TopCta } from "@/components/guides/cta";
import { Eyebrow, SHELL } from "@/components/landing/parts";
import { JsonLd } from "@/components/seo/JsonLd";
import { dataLicense, licenseName } from "@/config/urls";
import type { ContentSection } from "@/content/section";
import { faqPageLd, sectionPageLd } from "@/i18n/structuredData";
import { contentComponents } from "@/content-system/render/renderContent";
import { mediaComponents } from "@/content-system/media/render";
import { resolveMediaRef } from "@/content-system/media/repository";
import { resolveAuthorCredits } from "@/content-system/authors/repository";
import { documentHeadings, documentStats } from "@/content-system/document";
import { categoriesByKeys } from "@/content-system/repository/categories";
import { locationsByKeys } from "@/content-system/repository/locations";
import { LocationLinks } from "@/components/article/LocationLinks";

// One page of a registry section, at any depth: /estadisticas/delitos-caba,
// /investigaciones/barrios-seguros-baratos-caba, and
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
  //
  // A page that moved keeps answering from its old address (cms.md). Asked
  // only after the miss, so a live page always wins, and 308
  // rather than 302 because the move is the editorial decision, not a
  // temporary detour.
  if (!page) {
    const moved = await section.redirect(slug);
    if (moved) permanentRedirect(section.href(moved));
    notFound();
  }

  const { Content, meta, document } = page;
  const [crumbs, children, media, categories, locations] = await Promise.all([
    section.crumbs(slug),
    section.children(slug),
    // Resolved from the body in one query before this renders, so an article's
    // cost does not scale with how many images it has.
    mediaComponents(document!.body),
    categoriesByKeys(document!.section, document!.metadata.categories),
    locationsByKeys(document!.metadata.locations),
  ]);
  const previewMedia = await resolveMediaRef(meta.previewMediaId);
  // Read from the document rather than from `meta`: the credits are markup, not
  // article furniture, and nothing that renders needs them yet.
  const credits = await resolveAuthorCredits(document!.metadata);
  // Section content is database-backed. The stored document is the single
  // source for both rendering and derived article data.
  const { words, minutes } = documentStats(document!);
  const headings = documentHeadings(document!);

  return (
    <>
      <JsonLd
        data={sectionPageLd({
          id: section.id,
          slug,
          ...meta,
          words,
          minutes,
          credits,
          locations,
        })}
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
                ...(categories[0]
                  ? [
                      {
                        name: categories[0].label,
                        href: `/${document!.section}/categoria/${categories[0].slug}`,
                      },
                    ]
                  : []),
                ...crumbs,
              ]}
            />

            {/* The phone's copy of the illustration: full width above the
                headline. From `lg` up the sidebar's copy shows instead, so this
                one is hidden rather than duplicated on screen. */}
            {previewMedia && (
              <ArticlePreview media={previewMedia} className="mb-7 lg:hidden" />
            )}

            <header className="pb-2">
              <Eyebrow tone="accent">{section.label}</Eyebrow>
              <h1 className="font-display font-semibold text-[34px] sm:text-[44px] tracking-[-0.025em] leading-[1.06] mt-[18px] mb-0">
                {meta.title}
              </h1>
              <ArticleByline
                author={credits.author}
                factChecker={credits.factChecker}
                className="mt-6"
              />
              {(credits.author || credits.factChecker) && (
                <hr className="border-0 border-t border-line mt-[18px] mb-[14px]" />
              )}
              {/* `lead="updated"` is the one way this header differs from a
                  guide's: on a page whose whole claim is "these are the current
                  numbers", the last update is the headline fact and the
                  original publication is provenance. */}
              <ArticleDateline
                published={meta.published}
                updated={meta.updated}
                minutes={minutes}
                lead="updated"
                className={
                  credits.author || credits.factChecker ? undefined : "mt-5"
                }
              />
              <CategoryChips
                categories={categories}
                section={document!.section}
                variant="badge"
                label={`Temas de ${section.label.toLowerCase()}`}
                className="mt-[22px]"
              />
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
                  ...media,
                  Faq: () => <Faq items={meta.faq ?? []} />,
                  // The same licence the `Dataset` markup declares — a page
                  // that overrides it says so on screen too.
                  Fuentes: () => (
                    <Fuentes
                      items={meta.sources}
                      license={
                        meta.dataset.license
                          ? {
                              url: meta.dataset.license,
                              name: licenseName(meta.dataset.license),
                            }
                          : dataLicense
                      }
                    />
                  ),
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

            <LocationLinks
              locations={locations}
              label={`Ubicación de ${section.label.toLowerCase()}`}
            />

            <nav
              className={
                locations.length ? "mt-8" : "mt-14 border-t border-line pt-6"
              }
            >
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
            above={previewMedia && <ArticlePreview media={previewMedia} />}
            below={<AsideCta />}
          />
        </div>
      </main>
    </>
  );
}

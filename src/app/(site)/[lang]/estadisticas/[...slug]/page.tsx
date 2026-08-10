import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/article/Breadcrumbs";
import { Faq } from "@/components/article/Faq";
import { TocInline, TocSidebar } from "@/components/article/Toc";
import { Fuentes } from "@/components/estadisticas/Fuentes";
import { StatsList } from "@/components/estadisticas/StatsList";
import { TopCta } from "@/components/guides/cta";
import { Eyebrow, SHELL } from "@/components/landing/parts";
import { JsonLd } from "@/components/seo/JsonLd";
import {
  loadStatsPage,
  statsChildren,
  statsCrumbs,
  statsHeadings,
  statsSlugs,
  statsStats,
} from "@/content/estadisticas/pages";
import { statsMetadata } from "@/i18n/metadata";
import { faqPageLd, statsPageLd } from "@/i18n/structuredData";

// One statistics page, at any depth: /estadisticas/inflacion today,
// /estadisticas/alquiler/caba the day a statistic gets per-district pages. The
// registry in `content/estadisticas/pages.ts` is the whole set, so a catch-all
// with `dynamicParams = false` 404s anything else.
//
// Structurally this is the guide article route with three differences, each of
// which is the section rather than a variation on it: the slug is a path (so the
// breadcrumb trail is walked, not composed by hand), the dateline leads with
// *updated* (a series is only as good as its last point), and a page with child
// pages can list them, wherever its prose puts `<Subpaginas />`.
export const dynamicParams = false;

export function generateStaticParams() {
  return statsSlugs().map((slug) => ({ slug }));
}

type Props = { params: Promise<{ slug: string[] }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const page = await loadStatsPage(slug);
  if (!page) return {};
  return statsMetadata({ slug, ...page.meta });
}

// Buenos Aires time, which is the offset the timestamps are authored in —
// Google requires the visible date to match the structured data, and the JSON-LD
// emits `meta.updated` verbatim.
const fmtDateTime = (iso: string) =>
  new Intl.DateTimeFormat("es-AR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(new Date(iso));

export default async function EstadisticaPage({ params }: Props) {
  const { slug } = await params;
  const page = await loadStatsPage(slug);
  // `dynamicParams = false` means this can't be reached in a build, but the
  // route's types don't know that and neither would a stale prerender.
  if (!page) notFound();

  const { Content, meta } = page;
  const [crumbs, children] = await Promise.all([
    statsCrumbs(slug),
    statsChildren(slug),
  ]);
  const { words, minutes } = statsStats(slug, meta.faq);
  const headings = statsHeadings(slug, meta.faq);

  return (
    <>
      <JsonLd data={statsPageLd({ slug, ...meta, words, minutes })} />
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
                { name: "Estadísticas", href: "/estadisticas" },
                ...crumbs,
              ]}
            />

            <header className="pb-2">
              <Eyebrow tone="accent">Estadísticas</Eyebrow>
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
                  <time dateTime={meta.updated}>{fmtDateTime(meta.updated)}</time>
                  <span aria-hidden="true"> ·</span>
                </span>
                {meta.updated !== meta.published && (
                  <span>
                    Publicado el{" "}
                    <time dateTime={meta.published}>
                      {fmtDateTime(meta.published)}
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
                components={{
                  Faq: () => <Faq items={meta.faq ?? []} />,
                  Fuentes: () => <Fuentes items={meta.sources} />,
                  // A hub page places its own children where its prose wants
                  // them, under its own heading — see AUTHORING.md §4. Renders
                  // nothing on a page that has none, so a leaf can carry the tag
                  // harmlessly and a hub that forgets it is the author's call
                  // rather than a layout accident.
                  Subpaginas: () =>
                    children.length > 0 ? (
                      <StatsList pages={children} titleAs="h3" />
                    ) : null,
                }}
              />
            </div>

            <nav className="mt-14 border-t border-line pt-6">
              <Link
                href="/estadisticas"
                className="font-mono text-micro uppercase tracking-label-wide text-muted no-underline transition-colors hover:text-accent"
              >
                ← Todas las estadísticas
              </Link>
            </nav>
          </article>

          <TocSidebar headings={headings} label="En esta página" />
        </div>
      </main>
    </>
  );
}

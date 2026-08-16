import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs } from "@/components/article/Breadcrumbs";
import { CategoryChips } from "@/components/guides/CategoryChips";
import { TopCta } from "@/components/guides/cta";
import { Faq } from "@/components/article/Faq";
import { TocInline, TocSidebar } from "@/components/article/Toc";
import { RelatedGuides } from "@/components/guides/RelatedGuides";
import { Eyebrow, SHELL } from "@/components/landing/parts";
import { JsonLd } from "@/components/seo/JsonLd";
import { getCategory } from "@/content/guias/categories";
import {
  guideHeadings,
  guideSlugs,
  guideStats,
  loadGuide,
  relatedGuides,
} from "@/content/guias/guides";
import { guideMetadata } from "@/i18n/metadata";
import { faqPageLd, guideLd } from "@/i18n/structuredData";
import { cn } from "@/lib/cn";

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

// Rendered in Buenos Aires time, which is the offset the timestamps are authored
// in — Google requires the visible date (and time, when shown) to match the
// structured data, and the JSON-LD emits `meta.published` verbatim. 24-hour
// clock: that's how Argentina writes times.
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

/** The guide's illustration, at whichever of its two placements is showing.
 * Written once and rendered twice — at the top of the contents column from `lg`
 * up, and above the headline below that, where there is no column — the same
 * shape `TocSidebar` / `TocInline` already use for the contents itself. One
 * `src`, so the second copy costs a cache hit rather than a download.
 *
 * `alt=""` for the reason the listing thumbnail uses it: the <h1> right beside
 * it already names the guide, and the image adds nothing a screen reader would
 * want read a second time. The intrinsic size is the file's, so the box is
 * reserved before it loads and the headline under it doesn't jump. Not lazy:
 * at both placements it is on the first screen. */
function Preview({ src, className }: { src: string; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      width={960}
      height={540}
      decoding="async"
      className={cn(
        "w-full aspect-video object-cover border border-line bg-card",
        className,
      )}
    />
  );
}

export default async function GuidePage({ params }: Props) {
  const { slug } = await params;
  const { Content, meta } = await loadGuide(slug);
  const related = await relatedGuides(slug);
  const { words, minutes } = guideStats(slug, meta.faq);
  const headings = guideHeadings(slug, meta.faq);

  // Categories in the order the guide declares them: primary first, which is
  // also the one that earns the breadcrumb crumb.
  const categories = meta.categories
    .map(getCategory)
    .filter((c) => c !== undefined);
  const primary = categories[0];

  return (
    <>
      <JsonLd
        data={guideLd({
          slug,
          ...meta,
          section: primary?.label,
          words,
          minutes,
        })}
      />
      {/* Only when the guide actually renders the questions below — FAQPage
          markup for Q&A a visitor can't see on the page is a spam signal, and
          binding both to `meta.faq` is what makes that impossible here. */}
      {meta.faq && meta.faq.length > 0 && (
        <JsonLd data={faqPageLd(meta.faq, "es")} />
      )}

      <main className={SHELL}>
        {/* Two columns from `lg` up, where the shell is wide enough for the
            680px article, a 40px gutter and the 220px contents. Below that the
            aside renders nothing and this is the single column it always was. */}
        <div className="flex gap-10">
          <article className="w-full min-w-0 max-w-[680px] pt-10 pb-16">
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

            {/* The phone's copy of the illustration: full width at the top of
              the page, under the breadcrumbs and above the headline. From `lg`
              up it's the sidebar's copy that shows instead, so this one is
              hidden rather than duplicated on screen. */}
            {meta.preview && (
              <Preview src={meta.preview} className="mb-7 lg:hidden" />
            )}

            <header className="pb-2">
              <Eyebrow tone="accent">Guía</Eyebrow>
              <h1 className="font-display font-semibold text-[34px] sm:text-[44px] tracking-[-0.025em] leading-[1.06] mt-[18px] mb-0">
                {meta.title}
              </h1>
              {/* Wraps onto separate lines on a phone rather than truncating —
                three timestamped items don't fit one narrow line. Separators
                trail their item so a wrapped line never *starts* with a "·".
                There's always a following item (the reading time), so the
                trailing dots are never left dangling. */}
              <p className="flex flex-wrap gap-x-2 gap-y-1 font-mono text-micro uppercase tracking-label-wide text-muted mt-5">
                <span>
                  Publicado el{" "}
                  <time dateTime={meta.published}>
                    {fmtDateTime(meta.published)}
                  </time>
                  <span aria-hidden="true"> ·</span>
                </span>
                {meta.updated !== meta.published && (
                  <span>
                    Actualizado el{" "}
                    <time dateTime={meta.updated}>
                      {fmtDateTime(meta.updated)}
                    </time>
                    <span aria-hidden="true"> ·</span>
                  </span>
                )}
                <span>{minutes} min de lectura</span>
              </p>
              <CategoryChips
                categories={categories}
                label="Temas de esta guía"
                className="mt-5"
              />
            </header>

            {/* Above the article, not in it: the reader who bounces after the
              intro never reaches the closing <ClosingCta />, and this is the
              only offer they'll see. Copy comes from `meta.cta` so placement
              stays the page's call and the wording stays the guide's. */}
            <TopCta>{meta.cta}</TopCta>

            {/* The phone's copy of the contents. Above the prose, where a reader
              deciding whether this guide answers their question can see the
              sections without scrolling the whole article first. */}
            <TocInline headings={headings} label="En esta guía" />

            <div className="mt-8 border-t border-line pt-2">
              {/* `RelatedGuides` is overridden here rather than in
                mdx-components.tsx: the global map can't know which guide is
                rendering, so the page binds the resolved list and the MDX just
                places a bare <RelatedGuides /> where the author wants it. */}
              <Content
                components={{
                  RelatedGuides: () => <RelatedGuides guides={related} />,
                  Faq: () => <Faq items={meta.faq ?? []} />,
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

          {/* The illustration heads the gutter, above the contents. It's the
              one place on the article where it costs the prose nothing: beside
              the 680px column rather than in front of it. A guide with an image
              but too few sections to list keeps the column for it. */}
          <TocSidebar
            headings={headings}
            label="En esta guía"
            above={meta.preview && <Preview src={meta.preview} />}
          />
        </div>
      </main>
    </>
  );
}

import Link from "next/link";
import type { ReactNode } from "react";
import { ArticleByline } from "@/components/article/ArticleByline";
import { ArticleDateline } from "@/components/article/ArticleDateline";
import { ArticlePreview } from "@/components/article/ArticlePreview";
import type { MediaRef } from "@/content-system/media/repository";
import { Breadcrumbs } from "@/components/article/Breadcrumbs";
import { CategoryChips } from "@/components/guides/CategoryChips";
import { TopCta } from "@/components/guides/cta";
import { TocInline, TocSidebar } from "@/components/article/Toc";
import { Eyebrow, SHELL } from "@/components/landing/parts";
import type { ContentCategory } from "@/content-system/categories/types";
import type { ContentSection } from "@/content-system/types";
import type { AuthorRef } from "@/content-system/authors/types";
import type { Heading } from "@/content/headings";

// The guide article shell: everything around the prose.
//
// Extracted from the public route so the CMS preview and the public page are
// the *same* component rather than two arrangements that agree today (cms.md
// Phase 6 gate). Breadcrumbs, the header and its dateline, the contents column,
// the top CTA, the illustration and the closing navigation are defined once
// here; only the compiled body differs between the two callers, and it arrives
// as children.
//
// Body compilation is what still differs: the public route renders the MDX
// module Next compiled at build time, the preview renders one compiled from the
// database string. Phase 7 makes both the second. The shell does not care —
// which is the point of taking it as children.

export type ContentArticleProps = {
  title: string;
  /** Canonical path of this page, for the last breadcrumb. */
  href: string;
  /** ISO timestamps. `published` may be null for a page that has never been
   * published, in which case the dateline shows only the update. */
  published: string | null;
  updated: string;
  /** Copy for the `<TopCta />` banner between the header and the prose. */
  cta: string;
  /** Optional 16:9 illustration from the media library. */
  previewMedia?: MediaRef | null;
  categories?: readonly ContentCategory[];
  /** Who wrote the page and who verified it. Both optional at every level —
   * most pages predate the author list and carry neither. */
  credits?: { author?: AuthorRef | null; factChecker?: AuthorRef | null };
  /** Guides are the default; Noticias reuses this shell without its taxonomy. */
  section?: {
    id: ContentSection;
    label: string;
    singular: string;
    href: string;
    tocLabel: string;
    backLabel: string;
  };
  headings: readonly Heading[];
  minutes: number;
  /** The compiled prose. */
  children: ReactNode;
  /** Emitted above the article. The preview passes the same JSON-LD the public
   * page does, so structured data can be checked before publication. */
  structuredData?: ReactNode;
  /** Shown above the breadcrumbs. The preview uses it to say what is being
   * looked at; the public page has nothing to say and passes nothing. */
  banner?: ReactNode;
};

export function ContentArticle({
  title,
  href,
  published,
  updated,
  cta,
  previewMedia,
  categories = [],
  credits,
  section = {
    id: "guias",
    label: "Guías",
    singular: "Guía",
    href: "/guias",
    tocLabel: "En esta guía",
    backLabel: "← Todas las guías",
  },
  headings,
  minutes,
  children,
  structuredData,
  banner,
}: ContentArticleProps) {
  // Categories in the order the page declares them: primary first, which is
  // also the one that earns the breadcrumb crumb.
  const primary = categories[0];

  return (
    <>
      {structuredData}

      <main className={SHELL}>
        {banner}
        {/* Two columns from `lg` up, where the shell is wide enough for the
            680px article, a 40px gutter and the 220px contents. Below that the
            aside renders nothing and this is the single column it always was. */}
        <div className="flex gap-10">
          <article className="w-full min-w-0 max-w-[680px] pt-10 pb-16">
            <Breadcrumbs
              className="mb-7"
              items={[
                { name: "Inicio", href: "/" },
                { name: section.label, href: section.href },
                ...(primary
                  ? [
                      {
                        name: primary.label,
                        href: `/${section.id}/categoria/${primary.slug}`,
                      },
                    ]
                  : []),
                { name: title, href },
              ]}
            />

            {/* The phone's copy of the illustration: full width at the top of
                the page, under the breadcrumbs and above the headline. From
                `lg` up it's the sidebar's copy that shows instead, so this one
                is hidden rather than duplicated on screen. */}
            {previewMedia && (
              <ArticlePreview media={previewMedia} className="mb-7 lg:hidden" />
            )}

            <header className="pb-2">
              <Eyebrow tone="accent">{section.singular}</Eyebrow>
              <h1 className="font-display font-semibold text-[34px] sm:text-[44px] tracking-[-0.025em] leading-[1.06] mt-[18px] mb-0">
                {title}
              </h1>
              <ArticleByline
                author={credits?.author}
                factChecker={credits?.factChecker}
                className="mt-6"
              />
              {/* The rule belongs to the byline, not to the dateline: with
                  nobody credited it would sit directly under the headline and
                  divide the header from nothing. */}
              {(credits?.author || credits?.factChecker) && (
                <hr className="border-0 border-t border-line mt-[18px] mb-[14px]" />
              )}
              <ArticleDateline
                published={published}
                updated={updated}
                minutes={minutes}
                className={
                  credits?.author || credits?.factChecker ? undefined : "mt-5"
                }
              />
              {categories.length > 0 && (
                <CategoryChips
                  categories={categories}
                  section={section.id}
                  variant="badge"
                  label={`Temas de esta ${section.singular.toLowerCase()}`}
                  className="mt-[22px]"
                />
              )}
            </header>

            {/* Above the article, not in it: the reader who bounces after the
                intro never reaches the closing <ClosingCta />, and this is the
                only offer they'll see. Copy comes from the page's `cta` so
                placement stays the site's call and the wording stays the
                page's. */}
            <TopCta>{cta}</TopCta>

            {/* The phone's copy of the contents. Above the prose, where a reader
                deciding whether this guide answers their question can see the
                sections without scrolling the whole article first. */}
            <TocInline
              headings={headings as Heading[]}
              label={section.tocLabel}
            />

            <div className="mt-8 border-t border-line pt-2">{children}</div>

            <nav className="mt-14 border-t border-line pt-6">
              <Link
                href={section.href}
                className="font-mono text-micro uppercase tracking-label-wide text-muted no-underline transition-colors hover:text-accent"
              >
                {section.backLabel}
              </Link>
            </nav>
          </article>

          {/* The illustration heads the gutter, above the contents. It's the
              one place on the article where it costs the prose nothing: beside
              the 680px column rather than in front of it. A guide with an image
              but too few sections to list keeps the column for it. */}
          <TocSidebar
            headings={headings as Heading[]}
            label={section.tocLabel}
            above={
              previewMedia ? <ArticlePreview media={previewMedia} /> : undefined
            }
          />
        </div>
      </main>
    </>
  );
}

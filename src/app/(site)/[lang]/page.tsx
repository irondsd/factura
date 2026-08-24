import type { Metadata } from "next";
import { Fragment } from "react";
import { SiteFooter } from "@/components/landing/Footer";
import { LedgerPeek } from "@/components/landing/LedgerPeek";
import { Eyebrow, Perforation, Wordmark } from "@/components/landing/parts";
import {
  SectionTeasers,
  type TeaserBlock,
  type TeaserCard,
} from "@/components/landing/SectionTeasers";
import { SiteNav } from "@/components/landing/SiteNav";
import { TrustBlock } from "@/components/landing/TrustBlock";
import { JsonLd } from "@/components/seo/JsonLd";
import { Button } from "@/components/ui";
import { estadisticas } from "@/content/sections";
import { publishedGuides } from "@/content-system/repository/guias";
import { investigaciones } from "@/content/sections";
import type { ContentSection, SectionPage } from "@/content/section";
import { toLocale } from "@/i18n/config";
import { pageMetadata } from "@/i18n/metadata";
import { localizedHref } from "@/i18n/routing";
import { getI18n } from "@/i18n/server";
import { softwareApplicationLd } from "@/i18n/structuredData";
import { cn } from "@/lib/cn";

// Public marketing landing — "the long receipt": one narrow centered column
// that reads top-to-bottom like a single printed slip. The signed-in app lives
// under /app; every call to action points at /login.

const STEP_NUMBERS = ["01", "02", "03"];

// The receipt column: the narrow centered slip the hero, the product peek and
// the closing CTA are set in. Wide enough that the headline breaks where it
// wants to rather than where the column forces it.
const COLUMN = "mx-auto w-full max-w-[620px] px-6";

// The wider band the sections that can't fit the slip escape to — the trust
// block, the three steps, the editorial cards. Same gutter as the column on a
// phone, so the two line up down the left edge.
const BAND = "mx-auto w-full max-w-[1040px] px-6 sm:px-8";

type Props = { params: Promise<{ lang: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = toLocale((await params).lang);
  const { t } = await getI18n(locale);
  return pageMetadata({
    path: "/",
    locale,
    title: t.meta.home.title,
    description: t.meta.home.description,
  });
}

export default async function LandingPage({ params }: Props) {
  const locale = toLocale((await params).lang);
  const { t } = await getI18n(locale);
  const l = t.landing;

  // The editorial sections are Spanish-only — surface them on the es homepage
  // (a high-authority internal link). The footer's own links follow the same
  // rule.
  const blocks = locale === "es" ? await teaserBlocks() : [];

  return (
    <>
      <div className="mx-auto w-full max-w-[1040px] px-5 sm:px-8">
        <JsonLd
          data={softwareApplicationLd({
            locale,
            description: t.meta.home.description,
          })}
        />
        {/* ── Top nav ──────────────────────────────────────────── */}
        {/* No header bar here on purpose — just the links, quiet, at the top of
          the column so the page still reads as one printed slip. */}
        <SiteNav locale={locale} variant="inline" className="pt-[26px]" />
      </div>

      <div className={COLUMN}>
        {/* ── Hero ─────────────────────────────────────────────── */}
        <section className="text-center pt-[42px] pb-[60px]">
          <div className="mb-[22px]">
            <Eyebrow>{l.hero.eyebrow}</Eyebrow>
          </div>
          {/* The wordmark leads and the question follows, so the mark is the
              largest thing on the page and the headline is read as its
              caption. Both scale with the viewport rather than stepping at a
              breakpoint — the hero is one column at every width. */}
          <div className="mb-7">
            <Wordmark size="clamp(52px,8vw,66px)" />
          </div>
          <h1 className="font-display font-semibold text-[clamp(30px,5.6vw,44px)] tracking-tight leading-[1.08] m-0 mb-5 text-pretty text-ink">
            {l.hero.title}
          </h1>
          <p className="font-mono text-[14.5px] leading-[1.7] text-muted text-pretty mx-auto max-w-[460px]">
            {l.hero.body}
          </p>

          {/* Two CTAs: sign up, or read on. The second one is the honest
              answer to "what is this" — it drops the visitor at the product
              screenshot instead of at a sign-in form. */}
          <div className="flex flex-wrap items-stretch justify-center gap-2 mt-9">
            <Cta className="w-[240px]">{l.hero.cta}</Cta>
            <Button
              href="#peek"
              variant="outline"
              size="lg"
              className="w-[240px]"
            >
              {l.hero.ctaSecondary} ↓
            </Button>
          </div>
          <div className="mt-[34px]">
            <Eyebrow>{l.hero.trust}</Eyebrow>
          </div>
        </section>
      </div>

      {/* ── Trust block ──────────────────────────────────────── */}
      {/* Outside the receipt column on purpose — the same escape the footer
          takes. Five ruled columns need the shell's width; pinched to the
          column they'd be five 90px slivers. The band keeps the column's own
          px-6 gutter on a phone so the edges still line up. */}
      <div className={cn(BAND, "pb-16")}>
        <TrustBlock locale={locale} />
      </div>

      <div className={BAND}>
        <Perforation className="mb-16" />

        {/* ── How it works ─────────────────────────────────────── */}
        {/* Three slips in a row with the flow drawn between them, so the
            sequence is visible before a word of it is read. It leaves the
            receipt column for the same reason the trust block does: three
            cards side by side need the band's width. */}
        <section className="pb-16">
          <SectionLabel>{l.howItWorks}</SectionLabel>
          <div className="grid grid-cols-1 items-stretch gap-3 min-[900px]:grid-cols-[1fr_auto_1fr_auto_1fr] min-[900px]:gap-0">
            {l.steps.map((s, i) => (
              <Fragment key={STEP_NUMBERS[i]}>
                {/* The arrow between cards, not after them — and gone
                    entirely once the row stacks, where it would point at the
                    edge of the screen. */}
                {i !== 0 && (
                  <div
                    aria-hidden="true"
                    className="hidden min-[900px]:flex items-center justify-center px-3.5 text-[15px] text-muted"
                  >
                    →
                  </div>
                )}
                <div className="fd-card receipt-edge flex flex-col gap-3 text-center px-[26px] pt-[30px] pb-[34px]">
                  <span className="font-display font-semibold text-[30px] leading-none tracking-tight text-accent">
                    {STEP_NUMBERS[i]}
                  </span>
                  <h3 className="font-display font-semibold text-[21px] leading-[1.2] tracking-tight text-ink m-0">
                    {s.title}
                  </h3>
                  <p className="font-mono text-[13px] leading-[1.65] text-muted text-pretty m-0">
                    {s.body}
                  </p>
                </div>
              </Fragment>
            ))}
          </div>
        </section>
      </div>

      <div className={COLUMN}>
        <Perforation className="mb-16" />

        {/* ── Product peek ─────────────────────────────────────── */}
        {/* The hero's second CTA lands here, so the section carries the id and
            a little scroll margin to keep the label off the top edge. */}
        <section id="peek" className="pb-16 scroll-mt-6">
          <SectionLabel>{l.peekInside}</SectionLabel>
          <LedgerPeek compact locale={locale} />
          <p className="text-center font-mono text-xs text-muted mt-[18px]">
            {l.peekCaption}
          </p>
          <div className="mt-6 flex flex-col gap-5 border border-line border-l-2 border-l-accent bg-card p-5">
            <div className="min-w-0">
              <Eyebrow tone="accent">{l.demo.eyebrow}</Eyebrow>
              <h2 className="font-display font-semibold text-[clamp(23px,4vw,30px)] leading-[1.12] tracking-tight text-ink m-0 mt-2 mb-2 text-pretty">
                {l.demo.title}
              </h2>
              <p className="font-mono text-[13px] leading-[1.65] text-muted text-pretty m-0">
                {l.demo.body}
              </p>
              <p className="font-mono text-micro uppercase tracking-label text-muted mt-3 m-0">
                {l.demo.note}
              </p>
            </div>
            <Button
              href={localizedHref("/demo", locale)}
              variant="accent"
              size="lg"
              className="shrink-0 self-start"
            >
              {l.demo.cta} →
            </Button>
          </div>
        </section>
      </div>

      <div className={BAND}>
        <Perforation className="mb-16" />

        {/* ── What moves a bill ────────────────────────────────── */}
        {/* Six words rather than six paragraphs. The old feature list said the
            same things at length; by this point in the page the product has
            already been shown, so the tokens are a reminder of what it reads,
            and the CTA under them is where the page expects the click. */}
        <section className="pb-14 text-center">
          <div className="mb-[22px]">
            <Eyebrow>{l.drivers.label}</Eyebrow>
          </div>
          <div className="flex flex-wrap justify-center gap-2 max-w-[820px] mx-auto mb-[30px]">
            {l.drivers.items.map((item) => (
              <span
                key={item}
                className="border border-line bg-card font-mono text-[11.5px] tracking-[0.02em] text-ink px-[11px] py-1.5"
              >
                {item}
              </span>
            ))}
          </div>
          <div className="flex justify-center">
            <Cta className="w-[240px]">{l.hero.cta}</Cta>
          </div>
        </section>

        {/* ── What you get, ruled off ──────────────────────────── */}
        {/* The terms, set as one ruled line like the totals band on a slip —
            deliberately not five more cards, so it reads as fine print the
            page stands behind rather than as another feature grid. */}
        <section className="pb-16">
          <div className="flex flex-wrap items-center justify-center gap-x-3.5 gap-y-2 border-y border-line py-[18px]">
            {l.promises.map((promise, i) => (
              // The separator travels with the term that follows it rather
              // than standing as its own flex item, so a wrapped line can
              // never end on a dangling middot — which is most of them once
              // the band is a phone wide.
              <span key={promise} className="flex items-center gap-x-3.5">
                {i !== 0 && (
                  <span aria-hidden="true" className="text-muted">
                    ·
                  </span>
                )}
                <span className="font-mono text-micro font-medium uppercase tracking-[0.16em] text-ink">
                  {promise}
                </span>
              </span>
            ))}
          </div>
        </section>
      </div>

      {/* ── Editorial sections (Spanish-only) ────────────────── */}
      {/* Outside the receipt column, like the two bands above: these are
          three-up cards with previews, and pinched to the column they'd be
          three 170px slivers. The heading comes with them — with no blocks to
          introduce there is nothing for it to say. */}
      {blocks.length > 0 && (
        <div className={cn(BAND, "pb-16")}>
          <section className="pb-10 text-center">
            <h2 className="font-display font-semibold text-[clamp(26px,3.4vw,34px)] leading-[1.12] tracking-tight text-ink m-0 mb-3.5">
              {l.editorial.title}
            </h2>
            <p className="font-mono text-[13.5px] leading-[1.65] text-muted text-pretty mx-auto max-w-[520px] m-0">
              {l.editorial.body}
            </p>
          </section>
          <SectionTeasers blocks={blocks} />
        </div>
      )}

      <div className={COLUMN}>
        <Perforation className="mb-16" />

        {/* ── Closing CTA ──────────────────────────────────────── */}
        <section className="text-center pb-16">
          <h2 className="font-display font-semibold text-3xl tracking-tight m-0 mb-[22px]">
            {l.closingTitle}
          </h2>
          <Cta className="w-[280px]">{l.hero.cta}</Cta>
        </section>
      </div>

      {/* ── Footer ───────────────────────────────────────────── */}
      {/* Outside the receipt column on purpose: the same full-width
          <SiteFooter/> the sub-pages use, so the rule and the links line up
          across the whole site instead of being pinched to the hero's width. */}
      <SiteFooter locale={locale} />
    </>
  );
}

// ── The three editorial blocks ───────────────────────────────────────────────
// Estadísticas first, then Investigaciones, then Guías. That is the order they
// deserve the homepage's attention in, and it is the reverse of how much of the
// Argentine web already covers them: the statistics are series nobody else
// publishes, the research is arithmetic only this site does, and the guides are
// the part anyone could write.

/** How many cards a block shows. Three, so a block is one grid row. */
const PER_BLOCK = 3;

/** Newest first by publication. Registry order is editorial, not chronological,
 * so every block sorts before it slices — and it sorts by `published` rather
 * than `updated` because the badge and the dateline both say "new", and a
 * statistics page refreshed with this month's INDEC release is not new. */
const newest = (pages: SectionPage[]): SectionPage[] =>
  [...pages]
    .sort((a, b) => Date.parse(b.meta.published) - Date.parse(a.meta.published))
    .slice(0, PER_BLOCK);

const sectionCards = (
  section: ContentSection,
  pages: SectionPage[],
): TeaserCard[] =>
  pages.map((page) => ({
    key: page.slug.join("/"),
    href: section.href(page.slug),
    title: page.meta.title,
    summary: page.meta.summary,
    previewMediaId: page.meta.previewMediaId,
    published: page.meta.published,
  }));

async function teaserBlocks(): Promise<TeaserBlock[]> {
  // `estadisticas.children([])` rather than `.listed()`: the latter includes the
  // six regional pages nested under Inflación de vivienda, and a homepage teaser
  // listing "GBA", "Cuyo", "Patagonia" as peers of the sections they belong to
  // reads as a sitemap. This is the top level only — one card per subject.
  // Research has no hierarchy yet, so its own `listed()` is already that.
  const [stats, research, guides] = await Promise.all([
    estadisticas.children([]),
    investigaciones.listed(),
    publishedGuides(),
  ]);

  return [
    {
      label: "Estadísticas",
      blurb:
        "Precios, alquileres y servicios en Argentina, con datos oficiales y actualizados cada mes.",
      cards: sectionCards(estadisticas, newest(stats)),
      allHref: "/estadisticas",
      allLabel: "Ver todas las estadísticas",
    },
    {
      label: "Investigaciones",
      blurb:
        "Informes propios a partir de datos públicos y de facturas reales.",
      cards: sectionCards(investigaciones, newest(research)),
      allHref: "/investigaciones",
      allLabel: "Ver todas las investigaciones",
    },
    {
      // `publishedGuides()` already comes back newest first by publication.
      label: "Guías",
      blurb:
        "Aprende a leer tus facturas y a entender qué pagas en cada servicio.",
      cards: guides.slice(0, PER_BLOCK).map((guide) => ({
        key: guide.slug,
        href: `/guias/${guide.slug}`,
        title: guide.title,
        summary: guide.summary,
        previewMediaId: guide.metadata.previewMediaId,
        published: guide.publishedAt ?? guide.contentUpdatedAt,
      })),
      allHref: "/guias",
      allLabel: "Ver todas las guías",
    },
  ].filter((block) => block.cards.length > 0);
}

// Solid "get started" call to action — the app's button, navigating. The
// caller sets the width, because it is sized to be the obvious target of the
// section it closes rather than to its own label: 240px beside the hero's
// second button, 280px alone at the foot of the page.
function Cta({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Button href="/login" variant="solid" size="lg" className={className}>
      {children}
    </Button>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-center mb-[30px]">
      <Eyebrow tone="accent">{children}</Eyebrow>
    </div>
  );
}

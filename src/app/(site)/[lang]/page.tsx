import type { Metadata } from "next";
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
import { getI18n } from "@/i18n/server";
import { softwareApplicationLd } from "@/i18n/structuredData";
import { cn } from "@/lib/cn";

// Public marketing landing — "the long receipt": one narrow centered column
// that reads top-to-bottom like a single printed slip. The signed-in app lives
// under /app; every call to action points at /login.

const STEP_NUMBERS = ["01", "02", "03"];

const HAIRLINE =
  "border-t border-[color-mix(in_srgb,var(--line)_70%,transparent)]";

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

      <div className="mx-auto max-w-[560px] px-6">
        {/* ── Hero ─────────────────────────────────────────────── */}
        <section className="text-center pt-[42px] pb-[60px]">
          <div className="mb-[22px]">
            <Eyebrow>{l.hero.eyebrow}</Eyebrow>
          </div>
          <div className="mb-7">
            <Wordmark size={46} />
          </div>
          <h1 className="font-display font-semibold text-[46px] tracking-tight leading-[1.08] m-0 mb-[22px] whitespace-pre-line text-ink">
            {l.hero.title}
          </h1>
          <p className="font-mono text-[14.5px] leading-[1.7] text-muted mx-auto max-w-[460px]">
            {l.hero.body}
          </p>

          <div className="flex flex-col items-center gap-3.5 mt-9">
            <Cta>{l.hero.cta}</Cta>
          </div>
          <div className="mt-[34px]">
            <Eyebrow>{l.hero.trust}</Eyebrow>
          </div>
        </section>
      </div>

      {/* ── Trust block ──────────────────────────────────────── */}
      {/* Outside the 560px receipt column on purpose — the same escape the
          footer takes. Five ruled columns need the shell's width; pinched to
          the column they'd be five 90px slivers. The band keeps the column's
          own px-6 gutter on a phone so the edges still line up. */}
      <div className="mx-auto w-full max-w-[1040px] px-6 pb-16 sm:px-8">
        <TrustBlock locale={locale} />
      </div>

      <div className="mx-auto max-w-[560px] px-6">
        <Perforation className="mb-16" />

        {/* ── How it works ─────────────────────────────────────── */}
        <section className="pb-16">
          <SectionLabel>{l.howItWorks}</SectionLabel>
          <div className="flex flex-col gap-1">
            {l.steps.map((s, i) => (
              <div
                key={STEP_NUMBERS[i]}
                className={cn(
                  "grid grid-cols-[64px_1fr] gap-5 py-6",
                  i !== 0 && HAIRLINE,
                )}
              >
                <span className="font-display font-semibold text-[34px] text-accent tracking-tight leading-none">
                  {STEP_NUMBERS[i]}
                </span>
                <div>
                  <h3 className="font-display font-semibold text-xl m-0 mb-2 tracking-tight">
                    {s.title}
                  </h3>
                  <p className="font-mono text-[13.5px] leading-[1.65] text-muted m-0">
                    {s.body}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <Perforation className="mb-16" />

        {/* ── Product peek ─────────────────────────────────────── */}
        <section className="pb-16">
          <SectionLabel>{l.peekInside}</SectionLabel>
          <LedgerPeek compact locale={locale} />
          <p className="text-center font-mono text-xs text-muted mt-[18px]">
            {l.peekCaption}
          </p>
        </section>

        <Perforation className="mb-16" />

        {/* ── Features ─────────────────────────────────────────── */}
        <section className="pb-16">
          <SectionLabel>{l.whatItDoes}</SectionLabel>
          <div>
            {l.features.map((f, i) => (
              <div
                key={f.label}
                className={cn("py-[18px]", i !== 0 && HAIRLINE)}
              >
                <div className="mb-[7px]">
                  <Eyebrow className="text-ink tracking-[0.14em]">
                    {f.label}
                  </Eyebrow>
                </div>
                <p className="font-mono text-[13.5px] leading-[1.65] text-muted m-0">
                  {f.body}
                </p>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* ── Editorial sections (Spanish-only) ────────────────── */}
      {/* Outside the 560px receipt column, like the TrustBlock above: these are
          three-up cards with previews, and pinched to the column they'd be
          three 170px slivers. */}
      {blocks.length > 0 && (
        <div className="mx-auto w-full max-w-[1040px] px-6 pb-16 sm:px-8">
          <SectionTeasers blocks={blocks} />
        </div>
      )}

      <div className="mx-auto max-w-[560px] px-6">
        <Perforation className="mb-16" />

        {/* ── Closing CTA ──────────────────────────────────────── */}
        <section className="text-center pb-16">
          <h2 className="font-display font-semibold text-3xl tracking-tight m-0 mb-[22px]">
            {l.closingTitle}
          </h2>
          <Cta>{l.hero.cta}</Cta>
        </section>
      </div>

      {/* ── Footer ───────────────────────────────────────────── */}
      {/* Outside the 560px receipt column on purpose: the same full-width
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
    preview: page.meta.preview,
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
        preview: guide.metadata.previewImage,
        published: guide.publishedAt ?? guide.contentUpdatedAt,
      })),
      allHref: "/guias",
      allLabel: "Ver todas las guías",
    },
  ].filter((block) => block.cards.length > 0);
}

// Solid "get started" call to action — the app's button, navigating. Wide
// enough to be the page's obvious target rather than sized to its label.
function Cta({ children }: { children: React.ReactNode }) {
  return (
    <Button href="/login" variant="solid" size="lg" className="min-w-[280px]">
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

import type { Metadata } from "next";
import Link from "next/link";
import { LedgerPeek } from "@/components/landing/LedgerPeek";
import { Eyebrow, Perforation, Wordmark } from "@/components/landing/parts";
import { JsonLd } from "@/components/seo/JsonLd";
import { toLocale } from "@/i18n/config";
import { LandingLanguageSwitch } from "@/i18n/LandingLanguageSwitch";
import { pageMetadata } from "@/i18n/metadata";
import { localizedHref } from "@/i18n/routing";
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

  const nav = [
    { label: t.nav.docs, href: "/docs" },
    { label: t.nav.faq, href: "/faq" },
    { label: t.nav.demo, href: "/demo" },
    { label: t.nav.privacy, href: "/privacy" },
    { label: t.nav.security, href: "/security" },
    { label: t.nav.signIn, href: "/login" },
    { label: t.nav.github, href: "https://github.com/irondsd/factura" },
  ];

  return (
    <div className="mx-auto max-w-[560px] px-6">
      <JsonLd
        data={softwareApplicationLd({
          locale,
          description: t.meta.home.description,
        })}
      />
      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="text-center pt-[60px] pb-[60px]">
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
            <div key={f.label} className={cn("py-[18px]", i !== 0 && HAIRLINE)}>
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

      {/* ── Closing CTA ──────────────────────────────────────── */}
      <section className="text-center pb-16">
        <h2 className="font-display font-semibold text-3xl tracking-tight m-0 mb-[22px]">
          {l.closingTitle}
        </h2>
        <Cta>{l.hero.cta}</Cta>
      </section>

      {/* ── Footer ───────────────────────────────────────────── */}
      <footer className="pb-14 border-t border-line pt-[26px] mt-2">
        <div className="flex flex-wrap items-center justify-between gap-[18px]">
          <Wordmark size={22} />
          <nav className="flex flex-wrap gap-[22px]">
            {nav.map((link) => (
              <a
                key={link.label}
                href={localizedHref(link.href, locale)}
                className="font-mono text-micro uppercase tracking-[0.16em] text-muted no-underline whitespace-nowrap transition-colors hover:text-accent"
              >
                {link.label}
              </a>
            ))}
          </nav>
        </div>
        <div className="mt-[22px] flex flex-wrap items-center gap-2 justify-between">
          <Eyebrow>{l.footer.left}</Eyebrow>
          <div className="flex items-center gap-4">
            <LandingLanguageSwitch />
            <Eyebrow>{l.footer.right}</Eyebrow>
          </div>
        </div>
      </footer>
    </div>
  );
}

// Solid "get started" call to action. Mirrors the app's <Button variant="solid"
// size="lg"> classes, rendered as a Link since it navigates.
function Cta({ children }: { children: React.ReactNode }) {
  return (
    <Link
      href="/login"
      className="inline-flex items-center justify-center gap-2 whitespace-nowrap min-w-[280px] py-2.5 px-4 font-mono text-xs uppercase tracking-label leading-none border border-ink bg-ink text-paper no-underline transition-colors hover:bg-accent hover:border-accent"
    >
      {children}
    </Link>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-center mb-[30px]">
      <Eyebrow tone="accent">{children}</Eyebrow>
    </div>
  );
}

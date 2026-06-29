import { SiteFooter } from "@/components/landing/Footer";
import { SiteHeader } from "@/components/landing/Header";
import { Eyebrow, SHELL } from "@/components/landing/parts";
import type { Locale } from "@/i18n/config";
import { cn } from "@/lib/cn";

// Shared layout for prose policy pages (Privacy, Security): the same marketing
// chrome as Docs/FAQ, a narrow reading column, and a list of titled sections.
// Sections carry an `id` so they can be deep-linked. Bodies are trusted,
// author-controlled HTML strings from the dictionary (paragraphs, <strong>,
// links, and `.bullets` lists); the container below supplies all styling via
// descendant selectors so no Tailwind utilities live in the translations.

export type LegalSection = { id: string; heading: string; body: string };

const PROSE = cn(
  "font-mono text-sm leading-[1.75] text-muted max-w-[68ch]",
  "[&_p]:mb-3.5",
  "[&_a]:text-accent [&_a]:underline [&_a]:decoration-dotted [&_a]:underline-offset-[3px]",
  "[&_strong]:text-ink [&_strong]:font-medium",
  "[&_.bullets]:list-none [&_.bullets]:p-0 [&_.bullets]:my-3.5 [&_.bullets]:flex [&_.bullets]:flex-col [&_.bullets]:gap-2",
  "[&_.bullets_li]:relative [&_.bullets_li]:pl-[22px] [&_.bullets_li]:before:content-['—'] [&_.bullets_li]:before:absolute [&_.bullets_li]:before:left-0 [&_.bullets_li]:before:text-accent",
);

export function LegalPage({
  active,
  locale,
  eyebrow,
  title,
  intro,
  lastUpdatedLabel,
  updated,
  sections,
}: {
  /** Matched by href, e.g. "/privacy". */
  active: string;
  locale: Locale;
  eyebrow: string;
  title: string;
  intro: string;
  lastUpdatedLabel: string;
  updated: string;
  sections: LegalSection[];
}) {
  return (
    <>
      <SiteHeader active={active} locale={locale} />

      <main className={SHELL}>
        {/* ── Head ─────────────────────────────────────────────── */}
        <header className="max-w-[680px] pt-14 pb-2">
          <Eyebrow tone="accent">{eyebrow}</Eyebrow>
          <h1 className="font-display font-semibold text-[36px] sm:text-[46px] tracking-[-0.025em] leading-[1.05] mt-[18px] mb-0">
            {title}
          </h1>
          <p className="font-mono text-[15px] leading-[1.7] text-muted mt-[18px] mb-0">
            {intro}
          </p>
          <p className="font-mono text-micro uppercase tracking-label-wide text-muted mt-5">
            {lastUpdatedLabel} · {updated}
          </p>
        </header>

        {/* table of contents */}
        <nav className="max-w-[680px] mt-9 border-t border-line pt-5">
          <ol className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2 list-none p-0 m-0">
            {sections.map((s, i) => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  className="font-mono text-[13px] text-muted no-underline transition-colors hover:text-accent"
                >
                  <span className="text-accent">
                    {String(i + 1).padStart(2, "0")}
                  </span>{" "}
                  {s.heading}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        {/* ── Sections ─────────────────────────────────────────── */}
        <div className="max-w-[680px] pb-16">
          {sections.map((s) => (
            <section key={s.id} id={s.id} className="pt-11 scroll-mt-24">
              <h2 className="font-display font-semibold text-[23px] sm:text-[25px] tracking-tight m-0 mb-4">
                {s.heading}
              </h2>
              <div
                className={PROSE}
                dangerouslySetInnerHTML={{ __html: s.body }}
              />
            </section>
          ))}
        </div>
      </main>

      <SiteFooter locale={locale} />
    </>
  );
}

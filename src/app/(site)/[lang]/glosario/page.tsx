import type { Metadata } from "next";
import { SiteFooter } from "@/components/landing/Footer";
import { SiteHeader } from "@/components/landing/Header";
import { Eyebrow, SHELL } from "@/components/landing/parts";
import { JsonLd } from "@/components/seo/JsonLd";
import { Button } from "@/components/ui";
import { toLocale } from "@/i18n/config";
import { pageMetadata } from "@/i18n/metadata";
import { localizedHref } from "@/i18n/routing";
import { getI18n } from "@/i18n/server";
import { glossaryLd } from "@/i18n/structuredData";
import { cn } from "@/lib/cn";

type Props = { params: Promise<{ lang: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = toLocale((await params).lang);
  const { t } = await getI18n(locale);
  return pageMetadata({
    path: "/glosario",
    locale,
    title: t.meta.glossary.title,
    description: t.meta.glossary.description,
  });
}

// Public glossary of the vocabulary an Argentine utility bill uses — the page
// the guides, the FAQ and the docs can all point a term at instead of
// re-explaining it. Laid out as a dictionary: the headword in a left column,
// its definition in the reading column beside it, one hairline per entry.
//
// Every term carries its own anchor (`#vad`, `#pcs`), which is the point of the
// page: a definition is worth linking to, and the DefinedTermSet below claims
// the same ids so a citation resolves to the same paragraph a reader lands on.
//
// Definitions are trusted, author-controlled HTML from the dictionary (<p>,
// <strong>, <em>, <code>, links); the container supplies the styling by
// descendant selector, so no Tailwind utilities live in the translations.

const DEF_PROSE = cn(
  "font-mono text-sm leading-[1.7] text-muted",
  "[&_p]:m-0",
  "[&_a]:text-accent [&_a]:underline [&_a]:decoration-dotted [&_a]:underline-offset-[3px]",
  "[&_strong]:text-ink [&_strong]:font-medium",
  "[&_em]:not-italic [&_em]:text-ink",
  "[&_code]:font-mono [&_code]:text-[0.9em] [&_code]:bg-[var(--accent-soft)] [&_code]:border [&_code]:border-line [&_code]:px-[5px] [&_code]:py-px [&_code]:text-ink",
);

export default async function GlossaryPage({ params }: Props) {
  const locale = toLocale((await params).lang);
  const { t } = await getI18n(locale);
  const g = t.glossary;

  return (
    <>
      <JsonLd
        data={glossaryLd({
          locale,
          name: t.meta.glossary.title,
          description: t.meta.glossary.description,
          terms: g.groups.flatMap((group) => group.terms),
        })}
      />
      <SiteHeader active="/glosario" locale={locale} />

      <main className={SHELL}>
        {/* ── Head ─────────────────────────────────────────────── */}
        <header className="max-w-[680px] pt-14 pb-2">
          <Eyebrow tone="accent">{g.eyebrow}</Eyebrow>
          <h1 className="font-display font-semibold text-[36px] sm:text-[46px] tracking-[-0.025em] leading-[1.05] mt-[18px] mb-0">
            {g.title}
          </h1>
          <p className="font-mono text-[15px] leading-[1.7] text-muted mt-[18px] mb-0">
            {g.intro}
          </p>
          {/* The caveat belongs with the definitions, not in a section of its
              own: these describe the usual case, and bills vary. */}
          <p className="font-mono text-[12.5px] leading-[1.65] text-muted mt-5 border-l-2 border-[var(--accent-line)] pl-3.5">
            {g.note}
          </p>
        </header>

        {/* ── Section index ────────────────────────────────────── */}
        <nav className="mt-9 border-t border-line pt-5">
          <div className="mb-2.5">
            <Eyebrow>{g.tocLabel}</Eyebrow>
          </div>
          <ol className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2 list-none p-0 m-0">
            {g.groups.map((group, i) => (
              <li key={group.id}>
                <a
                  href={`#${group.id}`}
                  className="font-mono text-[13px] text-muted no-underline transition-colors hover:text-accent"
                >
                  <span className="text-accent">
                    {String(i + 1).padStart(2, "0")}
                  </span>{" "}
                  {group.label}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        {/* ── Groups ───────────────────────────────────────────── */}
        {g.groups.map((group) => (
          <section key={group.id} id={group.id} className="pt-12 scroll-mt-20">
            <h2 className="font-display font-semibold text-[23px] sm:text-[25px] tracking-tight m-0">
              {group.label}
            </h2>
            {/* Group blurbs carry a link or two — same trusted-HTML rule. */}
            <p
              className={cn(
                "font-mono text-[13.5px] leading-[1.7] text-muted mt-2 mb-0 max-w-[68ch]",
                "[&_a]:text-accent [&_a]:underline [&_a]:decoration-dotted [&_a]:underline-offset-[3px]",
              )}
              dangerouslySetInnerHTML={{ __html: group.blurb }}
            />

            <dl className="mt-6 border-t border-line m-0">
              {group.terms.map((term) => (
                <div
                  key={term.id}
                  id={term.id}
                  className="grid gap-1.5 border-b border-line py-5 scroll-mt-20 sm:grid-cols-[minmax(0,220px)_minmax(0,1fr)] sm:gap-8"
                >
                  <dt className="flex flex-col gap-1">
                    <a
                      href={`#${term.id}`}
                      className="font-mono text-[15px] text-ink no-underline transition-colors hover:text-accent"
                    >
                      {term.term}
                    </a>
                    {term.aka && (
                      <span className="font-mono text-[11px] leading-[1.5] text-muted">
                        {g.alsoLabel}: {term.aka}
                      </span>
                    )}
                  </dt>
                  <dd
                    className={cn(DEF_PROSE, "m-0 max-w-[68ch]")}
                    dangerouslySetInnerHTML={{ __html: term.def }}
                  />
                </div>
              ))}
            </dl>
          </section>
        ))}

        {/* ── Closing CTA ──────────────────────────────────────── */}
        <section className="fd-card mt-14 mb-16 px-7 pt-9 pb-12 text-center">
          <h2 className="font-display font-semibold text-[28px] tracking-tight m-0 mb-2">
            {g.ctaTitle}
          </h2>
          <p className="font-mono text-sm text-muted m-0 mb-[22px]">
            {g.ctaBody}
          </p>
          <Button
            href={localizedHref("/probar", locale)}
            variant="solid"
            size="xl"
          >
            {g.ctaButton}
          </Button>
        </section>
      </main>

      <SiteFooter locale={locale} />
    </>
  );
}

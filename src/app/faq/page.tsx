import type { Metadata } from "next";
import Link from "next/link";
import { SHELL, SiteFoot, SiteTop } from "@/components/landing/chrome";
import { Eyebrow } from "@/components/landing/parts";
import { getI18n } from "@/i18n/server";
import { cn } from "@/lib/cn";

export const metadata: Metadata = {
  title: "FAQ",
  description:
    "Factura — frequently asked questions about bills, parsing, storage and privacy.",
  alternates: { canonical: "/faq" },
};

// Public FAQ. A wider marketing sub-page (not the receipt column) built on the
// shared SiteTop/SiteFoot chrome. Answers are native <details> accordions so
// they work without JS; the first item opens by default. Answer bodies come
// from the dictionary as small HTML strings (links, <code>, .accent) — styling
// is supplied by the container's descendant selectors so no Tailwind utility
// classes need to live in the translations.

export default async function FaqPage() {
  const { t } = await getI18n();
  const f = t.faq;

  return (
    <>
      <SiteTop active="/faq" />

      <main className={SHELL}>
        {/* ── Head ─────────────────────────────────────────────── */}
        <header className="max-w-[640px] pt-14 pb-2">
          <Eyebrow tone="accent">{f.eyebrow}</Eyebrow>
          <h1 className="font-display font-semibold text-[36px] sm:text-[46px] tracking-[-0.025em] leading-[1.05] mt-[18px] mb-0">
            {f.title}
          </h1>
          <p className="font-mono text-[15px] leading-[1.7] text-muted mt-[18px] mb-0">
            {f.intro}
          </p>
        </header>

        {/* ── Sections ─────────────────────────────────────────── */}
        {f.sections.map((section, si) => (
          <section key={section.label} className="pt-10">
            <div className="mb-2">
              <Eyebrow>{section.label}</Eyebrow>
            </div>
            <div className="border-t border-line">
              {section.items.map((item, i) => (
                <FaqItem key={item.q} item={item} open={si === 0 && i === 0} />
              ))}
            </div>
          </section>
        ))}

        {/* ── Closing CTA ──────────────────────────────────────── */}
        <section className="fd-card mt-14 mb-16 px-7 pt-9 pb-12 text-center">
          <h2 className="font-display font-semibold text-[28px] tracking-tight m-0 mb-2">
            {f.ctaTitle}
          </h2>
          <p className="font-mono text-sm text-muted m-0 mb-[22px]">
            {f.ctaBody}
          </p>
          <Link
            href="/login"
            className="inline-flex items-center justify-center font-mono text-[13px] uppercase tracking-[0.12em] no-underline border border-ink bg-ink text-paper py-3 px-[26px] transition-colors hover:bg-transparent hover:text-ink"
          >
            {f.ctaButton}
          </Link>
        </section>
      </main>

      <SiteFoot />
    </>
  );
}

function FaqItem({
  item,
  open,
}: {
  item: { q: string; a: string };
  open?: boolean;
}) {
  return (
    <details className="group border-b border-line" open={open}>
      <summary
        className={cn(
          "flex items-center justify-between gap-4 cursor-pointer list-none py-5 pr-1",
          "font-mono text-[15.5px] text-ink transition-colors",
          "hover:text-accent group-open:text-accent",
          "[&::-webkit-details-marker]:hidden",
        )}
      >
        <span>{item.q}</span>
        <span className="flex-none font-mono text-xl leading-none text-muted group-open:text-accent">
          <span className="group-open:hidden">+</span>
          <span className="hidden group-open:inline">−</span>
        </span>
      </summary>
      {/* Answer is trusted, author-controlled dictionary content (links, <code>,
          <span class="accent">). Styling comes from these descendant selectors. */}
      <div
        className={cn(
          "font-mono text-sm leading-[1.75] text-muted max-w-[70ch] pr-10 pb-[22px]",
          "[&_a]:text-accent [&_a]:underline [&_a]:decoration-dotted [&_a]:underline-offset-[3px]",
          "[&_code]:font-mono [&_code]:text-[0.9em] [&_code]:bg-[var(--accent-soft)] [&_code]:border [&_code]:border-line [&_code]:px-[5px] [&_code]:py-px [&_code]:text-ink",
          "[&_.accent]:text-accent",
        )}
        dangerouslySetInnerHTML={{ __html: item.a }}
      />
    </details>
  );
}

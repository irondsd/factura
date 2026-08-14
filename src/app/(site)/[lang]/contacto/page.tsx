import type { Metadata } from "next";
import { ContactForm } from "@/components/landing/ContactForm";
import { SiteFooter } from "@/components/landing/Footer";
import { SiteHeader } from "@/components/landing/Header";
import { Eyebrow, SHELL } from "@/components/landing/parts";
import { TrustBlock } from "@/components/landing/TrustBlock";
import { JsonLd } from "@/components/seo/JsonLd";
import { toLocale } from "@/i18n/config";
import { pageMetadata } from "@/i18n/metadata";
import { getI18n } from "@/i18n/server";
import { contactPageLd } from "@/i18n/structuredData";
import { cn } from "@/lib/cn";

type Props = { params: Promise<{ lang: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = toLocale((await params).lang);
  const { t } = await getI18n(locale);
  return pageMetadata({
    path: "/contacto",
    locale,
    title: t.meta.contact.title,
    description: t.meta.contact.description,
  });
}

// Contact page: the addressed channels on the left, one form on the right for
// whoever doesn't want to open a mail client. The addresses come first on
// purpose — they're the route that works today, and the form's delivery is
// still being wired up (see /api/contact).
//
// Channel bodies are trusted, author-controlled HTML from the dictionary (one
// link each); the container styles them by descendant selector.

const CHANNEL_PROSE = cn(
  "font-mono text-[13px] leading-[1.65] text-muted m-0",
  "[&_a]:text-accent [&_a]:underline [&_a]:decoration-dotted [&_a]:underline-offset-[3px]",
);

export default async function ContactPage({ params }: Props) {
  const locale = toLocale((await params).lang);
  const { t } = await getI18n(locale);
  const c = t.contact;

  return (
    <>
      <JsonLd
        data={contactPageLd({
          locale,
          name: t.meta.contact.title,
          description: t.meta.contact.description,
          emails: c.channels
            .filter((channel) => channel.email)
            .map((channel) => ({ email: channel.email, label: channel.label })),
        })}
      />
      <SiteHeader active="/contacto" locale={locale} />

      <main className={SHELL}>
        {/* ── Head ─────────────────────────────────────────────── */}
        <header className="max-w-[640px] pt-14 pb-2">
          <Eyebrow tone="accent">{c.eyebrow}</Eyebrow>
          <h1 className="font-display font-semibold text-[36px] sm:text-[46px] tracking-[-0.025em] leading-[1.05] mt-[18px] mb-0">
            {c.title}
          </h1>
          <p className="font-mono text-[15px] leading-[1.7] text-muted mt-[18px] mb-0">
            {c.intro}
          </p>
        </header>

        <div className="mt-11 mb-16 grid gap-12 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)] lg:gap-16">
          {/* ── Channels ───────────────────────────────────────── */}
          <section>
            <div className="mb-2">
              <Eyebrow>{c.channelsLabel}</Eyebrow>
            </div>
            <ul className="list-none p-0 m-0 border-t border-line">
              {c.channels.map((channel) => (
                <li key={channel.id} className="border-b border-line py-[18px]">
                  <p className="font-mono text-[15px] text-ink m-0 mb-1">
                    {channel.label}
                  </p>
                  {channel.email && (
                    <a
                      href={`mailto:${channel.email}`}
                      className="font-mono text-[13px] text-accent underline decoration-dotted underline-offset-[3px]"
                    >
                      {channel.email}
                    </a>
                  )}
                  <p
                    className={cn(CHANNEL_PROSE, channel.email && "mt-1.5")}
                    dangerouslySetInnerHTML={{ __html: channel.body }}
                  />
                </li>
              ))}
            </ul>
          </section>

          {/* ── Form ───────────────────────────────────────────── */}
          <section className="fd-card px-6 pt-7 pb-8 sm:px-8">
            <Eyebrow tone="accent">{c.formEyebrow}</Eyebrow>
            <h2 className="font-display font-semibold text-[26px] tracking-tight mt-2.5 mb-1.5">
              {c.formTitle}
            </h2>
            <p className="font-mono text-sm leading-[1.7] text-muted mt-0 mb-2">
              {c.formIntro}
            </p>
            <p
              className={cn(CHANNEL_PROSE, "mb-6")}
              dangerouslySetInnerHTML={{ __html: c.billNote }}
            />
            <ContactForm />
          </section>
        </div>

        <TrustBlock locale={locale} className="mb-16" />
      </main>

      <SiteFooter locale={locale} />
    </>
  );
}

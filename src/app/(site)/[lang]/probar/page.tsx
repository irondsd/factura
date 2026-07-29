import type { Metadata } from "next";
import { SiteFooter } from "@/components/landing/Footer";
import { SiteHeader } from "@/components/landing/Header";
import { Eyebrow, SHELL } from "@/components/landing/parts";
import { ProbarClient } from "@/components/probar/ProbarClient";
import { toLocale } from "@/i18n/config";
import { pageMetadata } from "@/i18n/metadata";
import { getI18n } from "@/i18n/server";

type Props = { params: Promise<{ lang: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = toLocale((await params).lang);
  const { t } = await getI18n(locale);
  return pageMetadata({
    path: "/probar",
    locale,
    title: t.meta.probar.title,
    description: t.meta.probar.description,
  });
}

// The public bill-drop page: the only place the parser can be tried without an
// account. A static shell (header, copy, footer) around one client island —
// `getI18n` takes the route param rather than reading the cookie, which is what
// keeps this page in the SSG path.
export default async function ProbarPage({ params }: Props) {
  const locale = toLocale((await params).lang);
  const { t } = await getI18n(locale);
  const p = t.probar;

  return (
    <>
      <SiteHeader active="/probar" locale={locale} />

      <main className={SHELL}>
        <header className="max-w-[640px] pt-14 pb-2">
          <Eyebrow tone="accent">{p.eyebrow}</Eyebrow>
          <h1 className="font-display font-semibold text-[36px] sm:text-[46px] tracking-[-0.025em] leading-[1.05] mt-[18px] mb-0">
            {p.title}
          </h1>
          <p className="font-mono text-[15px] leading-[1.7] text-muted mt-[18px] mb-0">
            {p.intro}
          </p>
        </header>

        <div className="pt-10 pb-20">
          <ProbarClient />
        </div>
      </main>

      <SiteFooter locale={locale} />
    </>
  );
}

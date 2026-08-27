import type { Metadata } from "next";
import { SHELL } from "@/components/landing/parts";
import { DocsView } from "@/components/landing/DocsView";
import { SiteFooter } from "@/components/landing/Footer";
import { SiteHeader } from "@/components/landing/Header";
import { toLocale } from "@/i18n/config";
import { pageMetadata } from "@/i18n/metadata";
import { I18nProvider } from "@/i18n/I18nProvider";
import { pickNamespaces } from "@/i18n/namespaces";
import { getI18n } from "@/i18n/server";

type Props = { params: Promise<{ lang: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = toLocale((await params).lang);
  const { t } = await getI18n(locale);
  return pageMetadata({
    path: "/docs",
    locale,
    title: t.meta.docs.title,
    description: t.meta.docs.description,
  });
}

// Public documentation. The interactive TOC + article lives in <DocsView/>
// (client, reads the param locale via the I18nProvider); the page supplies
// metadata and the shared site chrome.
export default async function DocsPage({ params }: Props) {
  const locale = toLocale((await params).lang);
  const { t } = await getI18n(locale);
  return (
    <>
      <SiteHeader active="/docs" locale={locale} />
      <main className={SHELL}>
        {/* `docs` is 12 KB — the single largest namespace after the glossary
            and the legal pages. It belongs to this route and travels with it. */}
        <I18nProvider locale={locale} dictionary={pickNamespaces(t, ["docs"])}>
          <DocsView />
        </I18nProvider>
      </main>
      <SiteFooter locale={locale} />
    </>
  );
}

import type { Metadata } from "next";
import { SHELL, SiteFoot, SiteTop } from "@/components/landing/chrome";
import { DocsView } from "@/components/landing/DocsView";
import { toLocale } from "@/i18n/config";
import { pageMetadata } from "@/i18n/metadata";
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
  return (
    <>
      <SiteTop active="/docs" locale={locale} />
      <main className={SHELL}>
        <DocsView />
      </main>
      <SiteFoot locale={locale} />
    </>
  );
}

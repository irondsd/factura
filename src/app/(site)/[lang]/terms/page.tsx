import type { Metadata } from "next";
import { LegalPage } from "@/components/landing/LegalPage";
import { toLocale } from "@/i18n/config";
import { pageMetadata } from "@/i18n/metadata";
import { getI18n } from "@/i18n/server";

type Props = { params: Promise<{ lang: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = toLocale((await params).lang);
  const { t } = await getI18n(locale);
  return pageMetadata({
    path: "/terms",
    locale,
    title: t.meta.terms.title,
    description: t.meta.terms.description,
  });
}

export default async function TermsPage({ params }: Props) {
  const locale = toLocale((await params).lang);
  const { t } = await getI18n(locale);
  const terms = t.legal.terms;

  return (
    <LegalPage
      active="/terms"
      locale={locale}
      eyebrow={terms.eyebrow}
      title={terms.title}
      intro={terms.intro}
      lastUpdatedLabel={t.legal.lastUpdated}
      updated={terms.updated}
      sections={terms.sections}
    />
  );
}

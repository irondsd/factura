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
    path: "/privacy",
    locale,
    title: t.meta.privacy.title,
    description: t.meta.privacy.description,
  });
}

export default async function PrivacyPage({ params }: Props) {
  const locale = toLocale((await params).lang);
  const { t } = await getI18n(locale);
  const p = t.legal.privacy;
  return (
    <LegalPage
      active="/privacy"
      locale={locale}
      eyebrow={p.eyebrow}
      title={p.title}
      intro={p.intro}
      lastUpdatedLabel={t.legal.lastUpdated}
      updated={p.updated}
      sections={p.sections}
    />
  );
}

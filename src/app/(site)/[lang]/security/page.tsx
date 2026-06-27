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
    path: "/security",
    locale,
    title: t.meta.security.title,
    description: t.meta.security.description,
  });
}

export default async function SecurityPage({ params }: Props) {
  const locale = toLocale((await params).lang);
  const { t } = await getI18n(locale);
  const s = t.legal.security;
  return (
    <LegalPage
      active="/security"
      locale={locale}
      eyebrow={s.eyebrow}
      title={s.title}
      intro={s.intro}
      lastUpdatedLabel={t.legal.lastUpdated}
      updated={s.updated}
      sections={s.sections}
    />
  );
}

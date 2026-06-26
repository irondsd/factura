import type { Metadata } from "next";
import { LegalPage } from "@/components/landing/LegalPage";
import { getI18n } from "@/i18n/server";

export const metadata: Metadata = {
  title: "Privacy",
  description:
    "How Factura handles your data — what it collects (bills, account email, properties), where it's stored, the third parties involved, and how to delete your data.",
  alternates: { canonical: "/privacy" },
};

export default async function PrivacyPage() {
  const { t } = await getI18n();
  const p = t.legal.privacy;
  return (
    <LegalPage
      active="/privacy"
      eyebrow={p.eyebrow}
      title={p.title}
      intro={p.intro}
      lastUpdatedLabel={t.legal.lastUpdated}
      updated={p.updated}
      sections={p.sections}
    />
  );
}

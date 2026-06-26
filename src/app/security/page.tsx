import type { Metadata } from "next";
import { LegalPage } from "@/components/landing/LegalPage";
import { getI18n } from "@/i18n/server";

export const metadata: Metadata = {
  title: "Security",
  description:
    "How Factura keeps your bills safe — passwordless authentication, per-account data isolation, encrypted storage with signed access, TLS in transit, and how to report a vulnerability.",
  alternates: { canonical: "/security" },
};

export default async function SecurityPage() {
  const { t } = await getI18n();
  const s = t.legal.security;
  return (
    <LegalPage
      active="/security"
      eyebrow={s.eyebrow}
      title={s.title}
      intro={s.intro}
      lastUpdatedLabel={t.legal.lastUpdated}
      updated={s.updated}
      sections={s.sections}
    />
  );
}

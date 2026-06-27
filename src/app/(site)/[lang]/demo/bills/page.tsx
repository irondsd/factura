import type { Metadata } from "next";
import { DemoBills } from "@/components/demo/DemoBills";
import { toLocale } from "@/i18n/config";
import { pageMetadata } from "@/i18n/metadata";
import { getI18n } from "@/i18n/server";

// Regenerated daily so the ledger's months roll forward with the calendar.
export const revalidate = 86400;

type Props = { params: Promise<{ lang: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = toLocale((await params).lang);
  const { t } = await getI18n(locale);
  return pageMetadata({
    path: "/demo/bills",
    locale,
    title: t.meta.demoBills.title,
    description: t.meta.demoBills.description,
  });
}

export default function DemoBillsPage() {
  return <DemoBills />;
}

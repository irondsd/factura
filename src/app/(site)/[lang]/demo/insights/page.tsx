import type { Metadata } from "next";
import { DemoInsights } from "@/components/demo/DemoInsights";
import { toLocale } from "@/i18n/config";
import { pageMetadata } from "@/i18n/metadata";
import { getI18n } from "@/i18n/server";

// Regenerated daily so the demo window rolls forward with the calendar.
export const revalidate = 86400;

type Props = { params: Promise<{ lang: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = toLocale((await params).lang);
  const { t } = await getI18n(locale);
  return pageMetadata({
    path: "/demo/insights",
    locale,
    title: t.meta.demoInsights.title,
    description: t.meta.demoInsights.description,
  });
}

export default function DemoInsightsPage() {
  return <DemoInsights />;
}

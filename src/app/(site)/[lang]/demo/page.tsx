import type { Metadata } from "next";
import { OverviewView } from "@/components/app/views/OverviewView";
import { toLocale } from "@/i18n/config";
import { pageMetadata } from "@/i18n/metadata";
import { localizedHref } from "@/i18n/routing";
import { getI18n } from "@/i18n/server";
import { demoOverview } from "@/lib/demo/fixtures";

// Static, but regenerated daily so the demo's "current month" rolls forward
// with the calendar (the dataset itself is anchored and stable — see fixtures).
export const revalidate = 86400;

type Props = { params: Promise<{ lang: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = toLocale((await params).lang);
  const { t } = await getI18n(locale);
  return pageMetadata({
    path: "/demo",
    locale,
    title: t.meta.demo.title,
    description: t.meta.demo.description,
  });
}

export default async function DemoOverviewPage({ params }: Props) {
  const locale = toLocale((await params).lang);
  return (
    <OverviewView
      data={demoOverview()}
      insightsHref={localizedHref("/demo/insights", locale)}
    />
  );
}

import type { Metadata } from "next";
import { DemoOverview } from "@/components/demo/DemoOverview";
import { toLocale } from "@/i18n/config";
import { pageMetadata } from "@/i18n/metadata";
import { localizedHref } from "@/i18n/routing";
import { getI18n } from "@/i18n/server";

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
  const { t } = await getI18n(locale);
  return (
    <>
      {/* The other two demo screens title themselves — their `Display` is the
          page heading and carries the `h1`. Overview leads with a money figure
          instead, which is no one's idea of a page title, so the heading is
          here and `sr-only`: the outline exists for the crawler and for
          heading navigation without putting a label on a screen designed
          without one. */}
      <h1 className="sr-only">{t.demo.overviewHeading}</h1>
      <DemoOverview insightsHref={localizedHref("/demo/insights", locale)} />
    </>
  );
}

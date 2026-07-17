"use client";

import { useApp } from "@/components/app/context";
import { OverviewView } from "@/components/app/views/OverviewView";
import { WelcomeOverview } from "@/components/app/views/WelcomeOverview";
import { FinePrint } from "@/components/ui";
import { trpc } from "@/lib/trpc";

export default function OverviewPage() {
  const { propertyId } = useApp();
  const overview = trpc.insights.overview.useQuery({ propertyId });

  if (!overview.data) {
    return <FinePrint className="mx-auto max-w-[64rem] px-5 py-8" />;
  }

  // A brand-new account has no parsed bills (no vendors present) and no active
  // accounts to await — show the first-run welcome instead of empty charts.
  const d = overview.data;
  if (d.vendors.length === 0 && d.awaiting.length === 0) {
    return <WelcomeOverview />;
  }

  return <OverviewView data={d} />;
}

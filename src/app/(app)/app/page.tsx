"use client";

import { useApp } from "@/components/app/context";
import { OverviewView } from "@/components/app/views/OverviewView";
import { FinePrint } from "@/components/ui";
import { trpc } from "@/lib/trpc";

export default function OverviewPage() {
  const { propertyId } = useApp();
  const overview = trpc.insights.overview.useQuery({ propertyId });

  if (!overview.data) {
    return <FinePrint className="mx-auto max-w-[64rem] px-5 py-8" />;
  }

  return <OverviewView data={overview.data} />;
}

"use client";

import { keepPreviousData } from "@tanstack/react-query";
import { useState } from "react";
import { useApp } from "@/components/app/context";
import { OverviewView } from "@/components/app/views/OverviewView";
import { WelcomeOverview } from "@/components/app/views/WelcomeOverview";
import { FinePrint } from "@/components/ui";
import { trpc } from "@/lib/trpc";

export default function OverviewPage() {
  const { propertyId } = useApp();
  // Which month the forecast block describes. `undefined` means "the current
  // one" and lets the server decide what that is, so the page can't disagree
  // with the ledger about today.
  const [month, setMonth] = useState<string | undefined>(undefined);

  // Another property has another ledger — one that may not even reach the month
  // on screen. Land on its current month instead of an empty past one. Adjusted
  // during render rather than in an effect, so the stale month never paints.
  const [scope, setScope] = useState(propertyId);
  if (scope !== propertyId) {
    setScope(propertyId);
    setMonth(undefined);
  }

  const overview = trpc.insights.overview.useQuery(
    { propertyId, month },
    // Keep the month you were reading on screen while the next one loads: the
    // whole page would otherwise drop to a skeleton on every pick.
    { placeholderData: keepPreviousData },
  );

  if (!overview.data) {
    return <FinePrint className="mx-auto max-w-[64rem] px-5 py-8" />;
  }

  // A brand-new account has no parsed bills (no vendors present) and no active
  // accounts to await — show the first-run welcome instead of empty charts.
  const d = overview.data;
  if (d.vendors.length === 0 && d.awaiting.length === 0) {
    return <WelcomeOverview />;
  }

  return (
    <OverviewView
      data={d}
      onMonthChange={setMonth}
      pending={overview.isPlaceholderData}
    />
  );
}

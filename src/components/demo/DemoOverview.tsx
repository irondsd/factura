"use client";

import { useState } from "react";
import { OverviewView } from "@/components/demo/views/OverviewView";
import { demoOverview } from "@/lib/demo/fixtures";

/** The /demo Overview. Holds the month the forecast block is showing, exactly
 * as the signed-in page does — `demoOverview` is a pure function of the pick,
 * so the fixtures stand in for the query without any of its machinery. */
export function DemoOverview({ insightsHref }: { insightsHref: string }) {
  const [month, setMonth] = useState<string | undefined>(undefined);
  return (
    <OverviewView
      data={demoOverview(month)}
      insightsHref={insightsHref}
      onMonthChange={setMonth}
    />
  );
}

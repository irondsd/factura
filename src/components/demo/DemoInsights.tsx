"use client";

import { InsightsView } from "@/components/app/views/InsightsView";
import { demoInsightsSource } from "@/components/demo/sources";
import { demoProperty } from "@/lib/demo/fixtures";

export function DemoInsights() {
  return <InsightsView source={demoInsightsSource} propertyId={demoProperty.id} />;
}

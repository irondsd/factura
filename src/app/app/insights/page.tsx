"use client";

import { useApp } from "@/components/app/context";
import {
  InsightsView,
  type InsightsSource,
} from "@/components/app/views/InsightsView";
import { trpc } from "@/lib/trpc";

// tRPC-backed data source for the signed-in Insights screen. The vendor-detail
// query stays idle until an actual vendor is picked (enabled gate).
const source: InsightsSource = {
  useSeries: (propertyId, range) =>
    trpc.insights.series.useQuery({ propertyId, range }).data,
  useVendorDetail: (propertyId, vendorId, range) =>
    trpc.insights.vendorDetail.useQuery(
      { propertyId, vendorId, range },
      { enabled: vendorId !== "all" },
    ).data,
};

export default function InsightsPage() {
  const { propertyId } = useApp();
  return <InsightsView source={source} propertyId={propertyId} />;
}

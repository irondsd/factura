"use client";

import { keepPreviousData } from "@tanstack/react-query";
import { useApp } from "@/components/app/context";
import {
  InsightsView,
  type InsightsSource,
} from "@/components/app/views/InsightsView";
import { trpc } from "@/lib/trpc";

// tRPC-backed data source for the signed-in Insights screen. The vendor-detail
// query stays idle until an actual vendor is picked (enabled gate). Both queries
// keep the previous window's data on screen while a new range loads, so dragging
// the range control (or switching presets) never flashes the charts to a spinner.
// Both also wait on `propertyReady`: until the URL's `?property=` name resolves
// to an id, asking would chart every property and then replace it.
const source: InsightsSource = {
  useSeries: (propertyId, win) => {
    const { propertyReady } = useApp();
    return trpc.insights.series.useQuery(
      { propertyId, ...win },
      { enabled: propertyReady, placeholderData: keepPreviousData },
    ).data;
  },
  useVendorDetail: (propertyId, vendorId, win) => {
    const { propertyReady } = useApp();
    return trpc.insights.vendorDetail.useQuery(
      { propertyId, vendorId, ...win },
      {
        enabled: propertyReady && vendorId !== "all",
        placeholderData: keepPreviousData,
      },
    ).data;
  },
};

export default function InsightsPage() {
  const { propertyId } = useApp();
  return <InsightsView source={source} propertyId={propertyId} />;
}

// Fixture-backed data sources that plug the static demo dataset into the same
// view components the signed-in app uses. These are plain (non-hook) functions —
// they return data synchronously — which keeps the call count stable wherever a
// view invokes them, satisfying the Rules of Hooks.

import type { BillsSource } from "@/components/app/views/BillsView";
import type { InsightsSource } from "@/components/app/views/InsightsView";
import {
  demoListPaged,
  demoProperties,
  demoSeries,
  demoVendorDetail,
  demoVendors,
  demoVendorsPresent,
} from "@/lib/demo/fixtures";

export const demoInsightsSource: InsightsSource = {
  useSeries: (_propertyId, win) => demoSeries(win),
  useVendorDetail: (_propertyId, vendorId, win) =>
    vendorId === "all" ? null : demoVendorDetail(vendorId, win),
};

export const demoBillsSource: BillsSource = {
  useVendors: () => demoVendors,
  useProperties: () => demoProperties,
  useVendorsPresent: () => demoVendorsPresent(),
  useListPaged: ({ vendorId, page, perPage }) =>
    demoListPaged({ vendorId, page, perPage }),
};

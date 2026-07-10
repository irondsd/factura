import type { InsightsWindow } from "@/lib/insights";
import type { RouterOutputs } from "@/lib/trpc";

export type SeriesData = RouterOutputs["insights"]["series"];
export type VendorDetail = NonNullable<
  RouterOutputs["insights"]["vendorDetail"]
>;
export type CustomFieldSeries = VendorDetail["fields"][number];

/** How the Insights screen reads its data. The signed-in app backs these with
 * tRPC queries (the vendor-detail one fetches lazily); /demo backs them with
 * static fixtures. Both are hooks, so the view calls them unconditionally in a
 * stable order (Rules of Hooks). `vendorDetail` is ignored while "all" vendors
 * are selected. */
export type InsightsSource = {
  useSeries: (
    propertyId: string | undefined,
    win: InsightsWindow,
  ) => SeriesData | undefined;
  useVendorDetail: (
    propertyId: string | undefined,
    vendorId: string,
    win: InsightsWindow,
  ) => VendorDetail | null | undefined;
};

/** The muted brown used for the USD reference line across the insight lenses. */
export const USD_LINE = "#4a4034";

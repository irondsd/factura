import type { InsightsWindow } from "@/lib/insights";
import type { DemoSeriesData, DemoVendorDetail } from "@/lib/demo/fixtures";

export type SeriesData = DemoSeriesData;
export type VendorDetail = DemoVendorDetail;
export type CustomFieldSeries = VendorDetail["fields"][number];

/** How the public Insights demo reads its static fixtures. These functions keep
 * a hook-shaped interface so the view can call them in a stable order. */
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

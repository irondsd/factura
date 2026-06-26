import type { Metadata } from "next";
import { OverviewView } from "@/components/app/views/OverviewView";
import { demoOverview } from "@/lib/demo/fixtures";

// Static, but regenerated daily so the demo's "current month" rolls forward
// with the calendar (the dataset itself is anchored and stable — see fixtures).
export const revalidate = 86400;

export const metadata: Metadata = {
  title: "Demo",
  description:
    "Explore Factura with sample data — a live demo of the bill ledger overview: this-month totals, awaiting bills, vendor share and monthly spend, no sign-in required.",
  alternates: { canonical: "/demo" },
};

export default function DemoOverviewPage() {
  return <OverviewView data={demoOverview()} insightsHref="/demo/insights" />;
}

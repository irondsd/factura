import type { Metadata } from "next";
import { DemoInsights } from "@/components/demo/DemoInsights";

export const metadata: Metadata = {
  title: "Demo · Insights",
  description:
    "A live demo of Factura's insights: stacked spend over time, vendor share, the inflation lens (pesos vs the dollar cost), and per-vendor consumption trends — on sample data.",
  alternates: { canonical: "/demo/insights" },
};

export default function DemoInsightsPage() {
  return <DemoInsights />;
}

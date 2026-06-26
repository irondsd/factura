import type { Metadata } from "next";
import { DemoBills } from "@/components/demo/DemoBills";

export const metadata: Metadata = {
  title: "Demo · Bills",
  description:
    "A live demo of Factura's bill ledger: every parsed bill per vendor and month with peso and USD amounts. Open one to see the extracted fields and text — on sample data.",
  alternates: { canonical: "/demo/bills" },
};

export default function DemoBillsPage() {
  return <DemoBills />;
}

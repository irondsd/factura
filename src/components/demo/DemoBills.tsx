"use client";

import { BillsView } from "@/components/app/views/BillsView";
import { demoBillsSource } from "@/components/demo/sources";
import { DemoBillDrawer } from "@/components/bill-drawer";
import { demoProperty } from "@/lib/demo/fixtures";

export function DemoBills() {
  return (
    <BillsView
      source={demoBillsSource}
      Drawer={DemoBillDrawer}
      propertyId={demoProperty.id}
    />
  );
}

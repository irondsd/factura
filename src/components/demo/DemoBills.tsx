"use client";

import { DemoBillDrawer } from "@/components/demo/bill-drawer/DemoBillDrawer";
import { demoBillsSource } from "@/components/demo/sources";
import { BillsView } from "@/components/demo/views/BillsView";
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

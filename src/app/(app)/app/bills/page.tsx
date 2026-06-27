"use client";

import { useApp } from "@/components/app/context";
import { BillsView, type BillsSource } from "@/components/app/views/BillsView";
import { BillDrawer } from "@/components/bill-drawer";
import { trpc } from "@/lib/trpc";

// tRPC-backed data source for the signed-in ledger.
const source: BillsSource = {
  useVendors: () => trpc.vendors.list.useQuery().data,
  useProperties: () => trpc.properties.list.useQuery().data,
  useVendorsPresent: (propertyId) =>
    trpc.bills.vendorsPresent.useQuery({ propertyId }).data,
  useListPaged: (args) => trpc.bills.listPaged.useQuery(args).data,
};

export default function BillsPage() {
  const { propertyId } = useApp();
  return (
    <BillsView source={source} Drawer={BillDrawer} propertyId={propertyId} />
  );
}

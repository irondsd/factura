"use client";

import { useApp } from "@/components/app/context";
import { BillsView, type BillsSource } from "@/components/app/views/BillsView";
import { BillDrawer } from "@/components/bill-drawer";
import { trpc } from "@/lib/trpc";

// tRPC-backed data source for the signed-in ledger. The property-scoped queries
// stay idle until the URL's `?property=` name has resolved to an id, so the
// ledger never paints every property's bills on its way to the chosen one.
const source: BillsSource = {
  useVendors: () => trpc.vendors.list.useQuery().data,
  useProperties: () => trpc.properties.list.useQuery().data,
  useVendorsPresent: (propertyId) => {
    const { propertyReady } = useApp();
    return trpc.bills.vendorsPresent.useQuery(
      { propertyId },
      { enabled: propertyReady },
    ).data;
  },
  useListPaged: (args) => {
    const { propertyReady } = useApp();
    return trpc.bills.listPaged.useQuery(args, { enabled: propertyReady }).data;
  },
};

export default function BillsPage() {
  const { propertyId } = useApp();
  return (
    <BillsView source={source} Drawer={BillDrawer} propertyId={propertyId} />
  );
}

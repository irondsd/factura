import { DataTable } from "@/components/figures/DataTable";
import { REGIONS } from "@/content/estadisticas/data/ipc-vivienda";

// The geography table for the methodology section: which districts INDEC puts
// in each of the regions the dataset covers.
//
// Rendered from the region registry rather than written out in the .mdx, for
// the same reason the charts read their numbers from the data module: the page
// explains a series, and the explanation and the series have to be describing
// the same seven regions. Adding a region to the registry adds a row here and a
// pair of charts to the page, with nothing to keep in sync by hand.

export function RegionesIpc() {
  return (
    <div className="my-6 overflow-x-auto">
      <DataTable
        rows={REGIONS}
        rowKey={(r) => r.id}
        columns={[
          {
            header: "Región",
            headClassName: "whitespace-nowrap",
            cellClassName: "align-top text-ink whitespace-nowrap",
            cell: (r) => r.label,
          },
          {
            header: "Qué incluye",
            headClassName: "pl-3",
            cellClassName: "pl-3 align-top text-ink/90",
            cell: (r) => r.covers,
          },
        ]}
      />
    </div>
  );
}

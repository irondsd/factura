import { DataTable } from "@/components/figures/DataTable";
import {
  formatPercent,
  LAST_UPDATED,
  lastInteranual,
  lastMonthly,
  REGIONS,
} from "@/content/estadisticas/data/ipc-vivienda";

// The at-a-glance table: the last published month, every region at once.
//
// It exists because fourteen charts answer "how did this move over six years"
// and nobody arrives asking that. They arrive asking "how much did it go up",
// and this is the row that answers it — before the reader has scrolled past a
// single figure. Everything in it is derived from the dataset, so it is exactly
// as current as the last point in the series and can't be forgotten in an
// update.

export function ResumenIpc() {
  return (
    <div className="my-6 overflow-x-auto">
      <DataTable
        rows={REGIONS}
        rowKey={(r) => r.id}
        caption={
          <caption className="caption-bottom pt-3 text-left font-mono text-xs leading-[1.6] text-muted">
            IPC de vivienda, agua, electricidad, gas y otros combustibles.
            Último dato disponible: {LAST_UPDATED}. Fuente: INDEC.
          </caption>
        }
        columns={[
          {
            header: "Región",
            cellClassName: "text-ink",
            cell: (r) => r.label,
          },
          {
            header: "Mensual",
            headClassName: "text-right pl-3",
            cellClassName: "text-right pl-3 text-ink/90 tabular-nums",
            cell: (r) => formatPercent(lastMonthly(r.id)),
          },
          {
            header: "Interanual",
            headClassName: "text-right pl-3",
            cellClassName: "text-right pl-3 text-ink/90 tabular-nums",
            cell: (r) => formatPercent(lastInteranual(r.id)),
          },
        ]}
      />
    </div>
  );
}

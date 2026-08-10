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
      <table className="w-full border-collapse font-mono text-[14px]">
        <caption className="caption-bottom pt-3 text-left font-mono text-xs leading-[1.6] text-muted">
          IPC de vivienda, agua, electricidad, gas y otros combustibles.
          Último dato disponible: {LAST_UPDATED}. Fuente: INDEC.
        </caption>
        <thead>
          <tr>
            <th className="text-left font-medium uppercase text-micro tracking-label-wide text-muted border-b border-line py-2 pr-4">
              Región
            </th>
            <th className="text-right font-medium uppercase text-micro tracking-label-wide text-muted border-b border-line py-2 pr-4">
              Mensual
            </th>
            <th className="text-right font-medium uppercase text-micro tracking-label-wide text-muted border-b border-line py-2">
              Interanual
            </th>
          </tr>
        </thead>
        <tbody>
          {REGIONS.map((r) => (
            <tr key={r.id}>
              <td className="border-b border-line/60 py-2 pr-4 text-ink">
                {r.label}
              </td>
              <td className="border-b border-line/60 py-2 pr-4 text-right text-ink/90 tabular-nums">
                {formatPercent(lastMonthly(r.id))}
              </td>
              <td className="border-b border-line/60 py-2 text-right text-ink/90 tabular-nums">
                {formatPercent(lastInteranual(r.id))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

import {
  COMPARABLE_REGIONS,
  FIRST_UPDATED,
  formatPercent,
  getRegion,
  LAST_UPDATED,
  lastInteranual,
  lastMonthly,
  multiple,
  type RegionId,
} from "@/content/estadisticas/data/ipc-vivienda";

// The opening panel of a region page: everything the reader came for, before
// they reach a chart.
//
// A region page is a page about one cut of a series everybody else also has, so
// the risk it runs is being six near-identical documents. This is the answer to
// that: every figure here is that region's own, and one of them — where the
// region ranks against the other five — only exists on the region pages, since
// it's a fact about the region rather than about the series. It's derived, so it
// stays true through a refresh with nothing to update by hand.

/** The six regions ranked by how much prices multiplied over the whole dataset,
 * most first. Computed once: it's the same ranking on all six pages. */
const RANKED = [...COMPARABLE_REGIONS]
  .map((r) => ({ id: r.id, value: multiple(r.id) }))
  .sort((a, b) => b.value - a.value);

const ORDINAL = ["1.ª", "2.ª", "3.ª", "4.ª", "5.ª", "6.ª"];

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line/60 py-2.5">
      <dt className="font-mono text-[13px] text-muted">{label}</dt>
      <dd className="m-0 font-mono text-[14px] text-ink tabular-nums text-right">
        {value}
      </dd>
    </div>
  );
}

export function ResumenRegion({ region }: { region: RegionId }) {
  const { label, covers } = getRegion(region);
  const rank = RANKED.findIndex((r) => r.id === region);
  const times = `×${multiple(region).toFixed(1).replace(".", ",")}`;

  return (
    <div className="fd-card my-8 px-5 py-5">
      <p className="font-mono text-micro uppercase tracking-label-wide text-muted m-0">
        {label} · en números
      </p>
      <p className="font-mono text-[13px] leading-[1.6] text-muted mt-2 mb-0">
        {covers}
      </p>

      <dl className="m-0 mt-4">
        <Row
          label={`Variación mensual (${LAST_UPDATED})`}
          value={formatPercent(lastMonthly(region))}
        />
        <Row
          label="Variación interanual"
          value={formatPercent(lastInteranual(region))}
        />
        <Row
          label={`Acumulado desde ${FIRST_UPDATED}`}
          value={times}
        />
        <Row
          label="Puesto entre las seis regiones"
          value={`${ORDINAL[rank]} de 6`}
        />
      </dl>

      <p className="font-mono text-[11.5px] leading-[1.6] text-muted mt-3 mb-0 opacity-85">
        IPC de vivienda, agua, electricidad, gas y otros combustibles. El puesto
        ordena las seis regiones por cuánto se multiplicaron los precios desde{" "}
        {FIRST_UPDATED}. Fuente: INDEC, datos hasta {LAST_UPDATED}.
      </p>
    </div>
  );
}

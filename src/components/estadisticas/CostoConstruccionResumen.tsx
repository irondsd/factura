import { DataFigure } from "@/components/figures/DataFigure";
import { DataTable } from "@/components/figures/DataTable";
import {
  costo,
  costoUsd,
  formatArs,
  formatPct,
  formatUsd,
  IS_PROVISIONAL,
  LAST_UPDATED,
  MODELS,
  yoy,
} from "@/content/estadisticas/data/costo-construccion-caba";

// The page's headline figure, and the literal answer to what people type into
// search: what one square metre of construction costs in CABA this month.
//
// A table rather than a chart, and first on the page for that reason. The
// question is a lookup, not a trend — someone asking "¿cuánto sale el m² de
// construcción?" wants a number they can multiply, and a chart makes them read
// one off an axis. The trend is the figure below this one.
//
// Ordinary server-rendered markup, so all five figures are in the HTML as text
// (AUTHORING.md §7) rather than waiting on a chart library to measure a box.
//
// The table shows the city total and four distinct model programs. These are
// source measurements, not quotes for a particular project.

export function CostoConstruccionResumen() {
  const rows = MODELS.map((m) => ({
    ...m,
    ars: costo(m.id),
    usd: costoUsd(m.id),
    change: yoy(m.id),
  }));
  const byCost = [...rows].sort((a, b) => a.ars - b.ars);
  const lowest = byCost[0];
  const highest = byCost.at(-1)!;

  return (
    <DataFigure
      header={{
        title: <>Costo de construcción del metro cuadrado en CABA</>,
        subtitle: (
          <>
            {LAST_UPDATED}
            {IS_PROVISIONAL && " · dato provisorio"} · pesos por m² de
            superficie construida
          </>
        ),
      }}
      caption={
        <>
          Entre los modelos, el costo más bajo corresponde a {lowest.label} (
          {formatArs(lowest.ars)}/m²) y el más alto a {highest.label} (
          {formatArs(highest.ars)}/m²).
        </>
      }
      note={
        <>
          Fuente de los valores en pesos: IDECBA. La equivalencia en dólares es
          nuestra y usa el promedio trimestral del dólar blue.
        </>
      }
    >
      <div className="overflow-x-auto">
        <DataTable
          rows={rows}
          rowKey={(r) => r.id}
          columns={[
            {
              header: "Modelo de edificio",
              cellClassName: "align-top",
              cell: (r) => (
                <>
                  <span className="text-ink">{r.label}</span>
                  <span className="block text-muted text-[11.5px] leading-[1.5] mt-0.5">
                    {r.description}
                  </span>
                  {r.usd !== null && (
                    <span className="block text-muted text-[11.5px] leading-[1.5] mt-0.5">
                      ≈ {formatUsd(r.usd)} por m²
                    </span>
                  )}
                </>
              ),
            },
            {
              header: "$ por m²",
              headClassName: "pl-3",
              numeric: true,
              cellClassName: "pl-3 align-top text-ink",
              cell: (r) => formatArs(r.ars),
            },
            {
              header: "Interanual",
              headClassName: "pl-3",
              numeric: true,
              cellClassName: "pl-3 align-top text-ink/90",
              cell: (r) => (r.change === null ? "—" : formatPct(r.change)),
            },
          ]}
        />
      </div>
    </DataFigure>
  );
}

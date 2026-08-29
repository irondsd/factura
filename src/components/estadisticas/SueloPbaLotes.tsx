import { DataFigure } from "@/components/figures/DataFigure";
import { DataTable } from "@/components/figures/DataTable";
import {
  formatUsd,
  lotes,
  METHOD,
  PROVINCIAL_LOT,
  PROVINCIAL_SUP,
  SOURCE,
  VINTAGE,
} from "@/content/estadisticas/data/suelo-pba";

// What a whole plot costs, by group of partidos.
//
// The map answers "how much is a square metre here", which is the comparable
// number. This answers the question people actually type — "cuánto cuesta un
// terreno en Tandil" — and the two are not the same arithmetic: the price of a
// lot is its own median of the asking prices, not the price per metre times the
// typical size. In San Pedro those two are half apart, because the small lots
// and the dear metres are not the same parcels.
//
// ── Why grouped and not one ranking ───────────────────────────────────────
// Sorted by price alone, the coast, the interior and the metropolitan edge
// interleave into a list that says nothing. Grouped, each block is a decision
// somebody is actually weighing — a plot at the sea, a plot in a city, a plot
// an hour out of Buenos Aires — and the differences within a block are the ones
// worth comparing. The groups are fixed lists in the data module; it throws if
// one of these partidos falls under the publication threshold.

const NUMBER = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 });

export function SueloPbaLotes() {
  const groups = lotes();

  return (
    <DataFigure
      header={{
        title: <>Cuánto cuesta un terreno, por partido</>,
        subtitle: (
          <>
            Lote típico en la provincia: {formatUsd(PROVINCIAL_LOT)} por{" "}
            {NUMBER.format(PROVINCIAL_SUP)} m² · relevamiento de {VINTAGE}
          </>
        ),
      }}
      caption={
        <>
          <strong className="text-ink font-normal">
            Las tres columnas no se multiplican entre sí.
          </strong>{" "}
          Cada una es la mediana de su propia columna: el lote típico es la
          mediana de los precios pedidos, la superficie es la mediana de las
          superficies y el valor por metro es la mediana de los valores por
          metro. Los lotes chicos y los metros caros no siempre son las mismas
          parcelas, así que multiplicar dos de estas cifras da un número que
          nadie pidió por nada.
        </>
      }
      note={
        <>
          Precios de oferta de terrenos de hasta{" "}
          {METHOD.maxSupM2.toLocaleString("es-AR")} m², relevados entre{" "}
          {VINTAGE}. Solo se publican los partidos con al menos{" "}
          {METHOD.minSamples} muestras. Fuente: {SOURCE}.
        </>
      }
    >
      <div className="overflow-x-auto">
        <DataTable
          groups={groups.map((g) => ({ ...g, key: g.id }))}
          rowKey={(r) => r.id}
          columns={[
            {
              header: "Partido",
              cellClassName: "align-top",
              cell: (r) => (
                <>
                  <span className="text-ink">{r.label}</span>
                  <span className="block text-muted text-[11.5px] leading-[1.5] mt-0.5">
                    {r.n} muestras
                  </span>
                </>
              ),
            },
            {
              header: "Lote típico",
              headClassName: "pl-3",
              numeric: true,
              cellClassName: "pl-3 align-top text-ink",
              cell: (r) => formatUsd(r.priceMedian),
            },
            {
              header: "Superficie",
              headClassName: "pl-3",
              numeric: true,
              cellClassName: "pl-3 align-top text-muted",
              cell: (r) => <>{NUMBER.format(r.supMedian)} m²</>,
            },
            {
              header: "US$ por m²",
              headClassName: "pl-3",
              numeric: true,
              cellClassName: "pl-3 align-top text-muted",
              cell: (r) => formatUsd(r.usdM2 as number),
            },
          ]}
        />
      </div>
    </DataFigure>
  );
}

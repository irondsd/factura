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
    <figure className="fd-card my-8 px-5 pt-5 pb-4">
      <figcaption className="mb-4">
        <h3 className="font-mono text-micro uppercase tracking-label-wide text-muted m-0 scroll-mt-24">
          Cuánto cuesta un terreno, por partido
        </h3>
        <p className="font-mono text-xs text-muted mt-1.5 opacity-85 leading-[1.6]">
          Lote típico en la provincia: {formatUsd(PROVINCIAL_LOT)} por{" "}
          {NUMBER.format(PROVINCIAL_SUP)} m² · relevamiento de {VINTAGE}
        </p>
      </figcaption>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="fd-th">Partido</th>
              <th className="fd-th text-right pl-3">Lote típico</th>
              <th className="fd-th text-right pl-3">Superficie</th>
              <th className="fd-th text-right pl-3">US$ por m²</th>
            </tr>
          </thead>
          {groups.map((g) => (
            <tbody key={g.id}>
              <tr>
                <th
                  colSpan={4}
                  className="fd-th text-left pt-5 pb-1 border-b-0"
                  scope="colgroup"
                >
                  {g.label}
                </th>
              </tr>
              {g.rows.map((r) => (
                <tr key={r.id}>
                  <td className="fd-td align-top">
                    <span className="text-ink">{r.label}</span>
                    <span className="block text-muted text-[11.5px] leading-[1.5] mt-0.5">
                      {r.n} muestras
                    </span>
                  </td>
                  <td className="fd-td text-right pl-3 align-top text-ink tabular-nums whitespace-nowrap">
                    {formatUsd(r.priceMedian)}
                  </td>
                  <td className="fd-td text-right pl-3 align-top text-muted tabular-nums whitespace-nowrap">
                    {NUMBER.format(r.supMedian)} m²
                  </td>
                  <td className="fd-td text-right pl-3 align-top text-muted tabular-nums whitespace-nowrap">
                    {formatUsd(r.usdM2 as number)}
                  </td>
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>

      <p className="font-mono text-xs text-muted mt-4 leading-[1.6]">
        <strong className="text-ink font-normal">
          Las tres columnas no se multiplican entre sí.
        </strong>{" "}
        Cada una es la mediana de su propia columna: el lote típico es la
        mediana de los precios pedidos, la superficie es la mediana de las
        superficies y el valor por metro es la mediana de los valores por metro.
        Los lotes chicos y los metros caros no siempre son las mismas parcelas,
        así que multiplicar dos de estas cifras da un número que nadie pidió por
        nada.
      </p>

      <p className="font-mono text-[11.5px] text-muted mt-3 leading-[1.6] opacity-85">
        Precios de oferta de terrenos de hasta{" "}
        {METHOD.maxSupM2.toLocaleString("es-AR")} m², relevados entre {VINTAGE}.
        Solo se publican los partidos con al menos {METHOD.minSamples} muestras.
        Fuente: {SOURCE}.
      </p>
    </figure>
  );
}

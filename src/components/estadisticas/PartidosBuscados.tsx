import {
  formatPct,
  formatUsd,
  LAST_UPDATED,
  NO_DATA,
  rankOf,
  REFERENCE_AREA,
  rows,
  totalPrice,
} from "@/content/estadisticas/data/venta-pba";

// The handful of partidos people actually type into a search box, pulled out of
// the 27-row table so they can be read without hunting.
//
// The table under the map already has every partido, sorted by price. What it
// can't give is *position*: that La Matanza sits where it does among the
// partidos with a figure is what makes its number mean something, and it is not
// readable from a list you have to count down. So each row carries its rank,
// and both the rank and the count it is out of are derived — the count moves
// whenever a report skips a month or the source adds a partido.
//
// Editorial, and deliberately short: a row per partido for all 27 would be the
// table above with extra columns.

/** The partidos this section covers, by `pba.ts` id. Chosen for how often they
 * are looked up — the big population centres and the two names that stand for
 * "zona norte" — not for what they cost. A list that quietly turned into "the
 * six dearest" would be a different page. */
const FEATURED = [
  "la-matanza",
  "la-plata",
  "quilmes",
  "lomas-de-zamora",
  "vicente-lopez",
  "tigre",
  "moron",
  "pilar",
] as const;

const AREA = REFERENCE_AREA.amb2;

export function PartidosBuscados() {
  const byId = new Map(rows().map((r) => [r.id, r]));
  const withFigure = rows().filter((r) => r.usd !== null).length;

  const featured = FEATURED.map((id) => {
    const r = byId.get(id);
    if (!r) {
      throw new Error(
        `PartidosBuscados: ${id} is not a priced partido. Update FEATURED or src/content/shared/pba.ts.`,
      );
    }
    return { ...r, rank: rankOf(id) };
  });

  return (
    <figure className="fd-card my-8 px-5 pt-5 pb-4">
      <figcaption className="mb-4">
        <h3 className="font-mono text-micro uppercase tracking-label-wide text-muted m-0 scroll-mt-24">
          El valor del m² en los partidos más consultados
        </h3>
        <p className="font-mono text-xs text-muted mt-1.5 opacity-85 leading-[1.6]">
          Puesto sobre {withFigure} partidos con dato · {LAST_UPDATED}
        </p>
      </figcaption>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="fd-th">Partido</th>
              <th className="fd-th text-right pl-3">US$ por m²</th>
              <th className="fd-th text-right pl-3">Un 2 ambientes</th>
            </tr>
          </thead>
          <tbody>
            {featured.map((r) => (
              <tr key={r.id}>
                <td className="fd-td align-top">
                  <span className="text-ink">{r.label}</span>
                  <span className="block text-muted text-[11.5px] leading-[1.5] mt-0.5">
                    {r.zonaLabel}
                    {r.rank === null ? "" : ` · puesto ${r.rank}`}
                  </span>
                </td>
                <td className="fd-td text-right pl-3 align-top tabular-nums whitespace-nowrap">
                  <span className="text-ink">
                    {r.usd === null ? NO_DATA : formatUsd(r.usd)}
                  </span>
                  <span className="block text-muted text-[11.5px] leading-[1.5] mt-0.5">
                    {r.anual === null ? "" : `${formatPct(r.anual)} anual`}
                  </span>
                </td>
                <td className="fd-td text-right pl-3 align-top text-ink tabular-nums whitespace-nowrap">
                  {r.usd === null ? "—" : formatUsd(totalPrice(r.usd, AREA))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="font-mono text-[11.5px] text-muted mt-4 leading-[1.6] opacity-85">
        El puesto es sobre los partidos que tienen precio publicado este mes,
        del más caro al más barato. El precio del dos ambientes usa {AREA} m²
        cubiertos de referencia; para otra superficie, multiplicá los metros por
        el valor del m². Los {rows().length} partidos con dato están en la tabla
        que sigue al mapa.
      </p>
    </figure>
  );
}

import {
  formatUsd,
  LAST_UPDATED,
  SOURCE,
  zonaIndex,
  zonas,
} from "@/content/estadisticas/data/venta-pba";
import { zonaCovers } from "@/content/shared/pba";

// The three zonas, side by side: the middle partido of each and the two ends of
// its range.
//
// It exists because "zona norte" and "zona sur" are how the market is actually
// discussed — an agent says the zone, never the partido — and because the map
// above shows that the zones are not blocks. This table is where that becomes
// arguable rather than impressionistic: the ranges overlap heavily, so a zone
// name predicts a price much worse than people talk as if it does.
//
// ── Two middles, and why both are printed ─────────────────────────────────
// `median` is the middle *partido* of the zone. `zonaIndex` is Zonaprop's own
// published index for it, which is weighted by how many units are advertised.
// They answer different questions — "what does a typical partido here cost"
// against "what does a typical listing here cost" — and they can differ by a
// lot where one big cheap partido holds most of the stock. Printing one and
// calling it "the zone's price" would be picking a side silently.

export function PrecioPartidoZona() {
  const rows = zonas().map((z) => ({
    ...z,
    index: zonaIndex(z.id).value,
    covers: zonaCovers(z.id),
  }));

  return (
    <figure className="fd-card my-8 px-5 pt-5 pb-4">
      <figcaption className="mb-4">
        <h3 className="font-mono text-micro uppercase tracking-label-wide text-muted m-0 scroll-mt-24">
          El precio del m² por zona
        </h3>
        <p className="font-mono text-xs text-muted mt-1.5 opacity-85 leading-[1.6]">
          Norte, oeste y sur · {LAST_UPDATED}
        </p>
      </figcaption>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="fd-th">Zona</th>
              <th className="fd-th text-right pl-3">Partido del medio</th>
              <th className="fd-th text-right pl-3">Más caro</th>
              <th className="fd-th text-right pl-3">Más barato</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((z) => (
              <tr key={z.id}>
                <td className="fd-td align-top">
                  <span className="text-ink whitespace-nowrap">{z.label}</span>
                  <span className="block text-muted text-[11.5px] leading-[1.5] mt-0.5">
                    {z.count} partidos
                    {z.index === null
                      ? ""
                      : ` · índice del portal ${formatUsd(z.index)}`}
                  </span>
                </td>
                <td className="fd-td text-right pl-3 align-top text-ink tabular-nums whitespace-nowrap">
                  {z.median === null ? "—" : formatUsd(z.median)}
                </td>
                <td className="fd-td text-right pl-3 align-top tabular-nums whitespace-nowrap">
                  {z.top === null ? (
                    "—"
                  ) : (
                    <>
                      <span className="text-ink">
                        {formatUsd(z.top.usd as number)}
                      </span>
                      <span className="block text-muted text-[11.5px] leading-[1.5] mt-0.5 whitespace-normal">
                        {z.top.label}
                      </span>
                    </>
                  )}
                </td>
                <td className="fd-td text-right pl-3 align-top tabular-nums whitespace-nowrap">
                  {z.bottom === null ? (
                    "—"
                  ) : (
                    <>
                      <span className="text-ink">
                        {formatUsd(z.bottom.usd as number)}
                      </span>
                      <span className="block text-muted text-[11.5px] leading-[1.5] mt-0.5 whitespace-normal">
                        {z.bottom.label}
                      </span>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="font-mono text-xs text-muted mt-4 leading-[1.6]">
        Cada zona va de su partido más caro al más barato, y los tres rangos se
        pisan entre sí: hay partidos del oeste por encima de partidos del norte
        y al revés. La zona sirve para ubicarse en el mapa, no para estimar un
        precio —para eso está el partido.
      </p>

      <p className="font-mono text-[11.5px] text-muted mt-3 leading-[1.6] opacity-85">
        El «partido del medio» es la mediana de los partidos de la zona, con
        cada partido contando una vez. El «índice del portal» es el promedio que
        publica la fuente, ponderado por la cantidad de avisos, así que los dos
        números no tienen por qué coincidir. Zona Norte:{" "}
        {rows.find((z) => z.id === "norte")?.covers}. Zona Oeste:{" "}
        {rows.find((z) => z.id === "oeste")?.covers}. Zona Sur:{" "}
        {rows.find((z) => z.id === "sur")?.covers}. Fuente: {SOURCE}, datos
        hasta {LAST_UPDATED}.
      </p>
    </figure>
  );
}

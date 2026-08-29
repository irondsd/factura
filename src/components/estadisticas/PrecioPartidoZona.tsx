import { DataFigure } from "@/components/figures/DataFigure";
import { DataTable } from "@/components/figures/DataTable";
import {
  formatUsd,
  LAST_UPDATED,
  SCOPE,
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
    <DataFigure
      header={{
        title: <>El precio del m² por zona del Gran Buenos Aires</>,
        subtitle: <>Norte, oeste y sur · {LAST_UPDATED}</>,
      }}
      caption={
        <>
          Las tres zonas son las del conurbano, no las de la provincia: {SCOPE}{" "}
          se divide en norte, oeste y sur, y el interior bonaerense no entra en
          ninguna. Cada zona va de su partido más caro al más barato, y los tres
          rangos se pisan entre sí: hay partidos del oeste por encima de
          partidos del norte y al revés. La zona sirve para ubicarse en el mapa,
          no para estimar un precio —para eso está el partido.
        </>
      }
      note={
        <>
          El «partido del medio» es la mediana de los partidos de la zona, con
          cada partido contando una vez. El «índice del portal» es el promedio
          que publica la fuente, ponderado por la cantidad de avisos, así que
          los dos números no tienen por qué coincidir. La Plata figura en la
          zona sur porque es donde la ubica la fuente, aunque no sea parte del
          conurbano. Zona Norte: {rows.find((z) => z.id === "norte")?.covers}.
          Zona Oeste: {rows.find((z) => z.id === "oeste")?.covers}. Zona Sur:{" "}
          {rows.find((z) => z.id === "sur")?.covers}. Fuente: {SOURCE}, datos
          hasta {LAST_UPDATED}.
        </>
      }
    >
      <div className="overflow-x-auto">
        <DataTable
          rows={rows}
          rowKey={(z) => z.id}
          columns={[
            {
              header: "Zona",
              cellClassName: "align-top",
              cell: (z) => (
                <>
                  <span className="text-ink whitespace-nowrap">{z.label}</span>
                  <span className="block text-muted text-[11.5px] leading-[1.5] mt-0.5">
                    {z.count} partidos
                    {z.index === null
                      ? ""
                      : ` · índice del portal ${formatUsd(z.index)}`}
                  </span>
                </>
              ),
            },
            {
              header: "Partido del medio",
              headClassName: "pl-3",
              numeric: true,
              cellClassName: "pl-3 align-top text-ink",
              cell: (z) => (z.median === null ? "—" : formatUsd(z.median)),
            },
            {
              header: "Más caro",
              headClassName: "pl-3",
              numeric: true,
              cellClassName: "pl-3 align-top",
              cell: (z) =>
                z.top === null ? (
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
                ),
            },
            {
              header: "Más barato",
              headClassName: "pl-3",
              numeric: true,
              cellClassName: "pl-3 align-top",
              cell: (z) =>
                z.bottom === null ? (
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
                ),
            },
          ]}
        />
      </div>
    </DataFigure>
  );
}

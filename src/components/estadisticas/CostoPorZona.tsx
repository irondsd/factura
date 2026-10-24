import { DataFigure } from "@/components/figures/DataFigure";
import { DataTable } from "@/components/figures/DataTable";
import {
  DEFAULT_SIZE,
  formatShare,
  formatUsd,
  JOIN_PERIOD,
  quarterLabel,
  SIZES,
  zonasShare,
} from "@/content/estadisticas/data/costo-construccion-caba";

// The same join as the map, summarised by zone instead of by barrio. Each row
// reports the median ratio and price difference among barrios with published
// prices; neither value allocates the price to a particular cost component.
//
// The grouping is ours (IDECBA publishes barrios and comunas and nothing else),
// so each row names the comunas it covers, which is what makes it checkable. It
// is the same grouping /estadisticas/precio-m2-caba uses, so the two tables can
// be read against one another.

/** The median barrio of the zone, not a mean of them. IDECBA weights its own
 * city total by how many units were advertised, which we can't reproduce, and an
 * unweighted mean would be dragged around by Puerto Madero on its own. */
const SIZE = SIZES.find((s) => s.id === DEFAULT_SIZE)!;

export function CostoPorZona() {
  if (JOIN_PERIOD === null) return null;
  const rows = zonasShare(DEFAULT_SIZE);

  return (
    <DataFigure
      header={{
        title: <>Costo directo modelo y precio publicado por zona</>,
        subtitle: (
          <>
            Barrio mediano de cada zona · departamentos de {SIZE.label} ·{" "}
            {quarterLabel(JOIN_PERIOD)}
          </>
        ),
      }}
      caption={
        <>
          Porcentaje del precio publicado que representa el costo directo del
          edificio modelo y diferencia aritmética entre esos valores. La
          proporción se calcula con el mismo costo para toda la Ciudad: un precio
          de publicación más alto produce un porcentaje menor.
        </>
      }
      note={
        <>
          La agrupación en cuatro zonas es nuestra —IDECBA publica barrios y
          comunas—; cada fila indica qué comunas incluye para que se pueda
          comprobar qué barrios se resumieron.
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
                  <span className="text-ink">{z.label}</span>
                  <span className="block text-muted text-[11.5px] leading-[1.5] mt-0.5">
                    {z.comunas}
                  </span>
                  {z.withData < z.total && (
                    <span className="block text-muted text-[11.5px] leading-[1.5] mt-0.5">
                      {z.withData} de {z.total} barrios con precio publicado
                    </span>
                  )}
                </>
              ),
            },
            {
              header: "% costo / precio",
              headClassName: "pl-3",
              numeric: true,
              cellClassName: "pl-3 align-top text-ink",
              cell: (z) => (z.median === null ? "—" : formatShare(z.median)),
            },
            {
              header: "Diferencia aritmética",
              headClassName: "pl-3",
              numeric: true,
              cellClassName: "pl-3 align-top text-ink/90",
              cell: (z) =>
                z.medianDifference === null
                  ? "—"
                  : `${formatUsd(z.medianDifference)}/m²`,
            },
          ]}
        />
      </div>
    </DataFigure>
  );
}

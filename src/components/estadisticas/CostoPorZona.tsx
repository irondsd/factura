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

// The same join as the map, read by zone instead of by barrio.
//
// Almost nobody searches for "la Comuna 12": the city is thought of in four
// pieces, and the pattern this table shows is the page's clearest single
// finding — in the south, most of what a square metre costs is the building; in
// the north, most of it is the ground it stands on.
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
        title: <>Obra y terreno por zona de la Ciudad</>,
        subtitle: (
          <>
            Barrio mediano de cada zona · departamentos de {SIZE.label} ·{" "}
            {quarterLabel(JOIN_PERIOD)}
          </>
        ),
      }}
      caption={
        <>
          En qué zonas de la Ciudad se paga sobre todo la construcción y en
          cuáles se paga sobre todo la ubicación. Las dos columnas son las dos
          caras del mismo metro cuadrado: cuanto mayor es el porcentaje que es
          obra, menos queda para el terreno.
        </>
      }
      note={
        <>
          Cada fila es el barrio que queda justo en la mitad de su zona, no un
          promedio: dentro de una misma zona conviven Puerto Madero y
          Constitución, y un promedio simple daría un número que no describe a
          ninguno de los dos. La agrupación en cuatro zonas es nuestra —IDECBA
          publica barrios y comunas—, y por eso cada fila dice qué comunas
          incluye. Datos del {quarterLabel(JOIN_PERIOD)}.
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
              header: "% que es obra",
              headClassName: "pl-3",
              numeric: true,
              cellClassName: "pl-3 align-top text-ink",
              cell: (z) => (z.median === null ? "—" : formatShare(z.median)),
            },
            {
              header: "Queda para el terreno",
              headClassName: "pl-3",
              numeric: true,
              cellClassName: "pl-3 align-top text-ink/90",
              cell: (z) =>
                z.medianSurplus === null
                  ? "—"
                  : `${formatUsd(z.medianSurplus)}/m²`,
            },
          ]}
        />
      </div>
    </DataFigure>
  );
}

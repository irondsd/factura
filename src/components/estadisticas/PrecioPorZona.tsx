import { DataFigure } from "@/components/figures/DataFigure";
import { DataTable } from "@/components/figures/DataTable";
import {
  DEFAULT_SIZE,
  formatUsd,
  LAST_UPDATED,
  SIZES,
  zonas,
} from "@/content/estadisticas/data/venta-caba";

// The city in four rows: norte, centro, oeste and sur.
//
// Nobody publishes this. IDECBA publishes barrios and comunas, and "zona norte"
// has no boundary — so every figure here is ours, computed from published
// barrio prices over a grouping of whole comunas that the reader can see and
// argue with (see `ZONAS` in data/caba.ts).
//
// Two decisions worth stating, because both are what keeps the row honest:
//
//   • the middle barrio, not an average. IDECBA weights its city total by how
//     many units were advertised, which we can't reproduce, and a plain mean of
//     barrios would put Puerto Madero's ~6.000 dollars a metre into the centro
//     row and move it by a third on its own;
//   • the two ends are named. A zone is not a price, it is a spread, and a
//     reader whose barrio is at one end deserves to see that the row they are
//     reading covers both.

const SIZE = SIZES.find((s) => s.id === DEFAULT_SIZE)!;

export function PrecioPorZona() {
  const rows = zonas(DEFAULT_SIZE);

  return (
    <DataFigure
      header={{
        title: <>Precio del metro cuadrado por zona de la Ciudad</>,
        subtitle: (
          <>
            Departamentos usados de {SIZE.inTitle} · {LAST_UPDATED}
          </>
        ),
      }}
      caption={
        <>
          El valor del metro cuadrado por zona en CABA: cuánto cuesta en el
          norte, en el centro, en el oeste y en el sur de la Ciudad, y qué
          distancia hay entre el barrio más caro y el más barato de cada una.
        </>
      }
      note={
        <>
          Las zonas no son geografía oficial: agrupamos comunas enteras, y la
          columna del medio es la mediana de los barrios de la zona —el valor
          que deja la mitad de los barrios por encima y la mitad por debajo—, no
          un promedio ponderado como el de la Ciudad. Calculado sobre los
          precios de publicación que IDECBA releva de Argenprop, datos hasta el{" "}
          {LAST_UPDATED}.
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
                    {z.comunas} · {z.withData} de {z.total} barrios con dato
                  </span>
                </>
              ),
            },
            {
              header: "Barrio del medio",
              headClassName: "pl-3",
              numeric: true,
              cellClassName: "pl-3 text-ink align-top",
              cell: (z) => (z.median === null ? "—" : formatUsd(z.median)),
            },
            {
              header: "Del más barato al más caro",
              headClassName: "text-right pl-3",
              cellClassName: "text-right pl-3 align-top",
              cell: (z) =>
                z.cheapest && z.dearest ? (
                  <>
                    {/* Each price unbreakable, the pair breakable: on a phone
                        the range wraps after the dash instead of forcing a
                        ~170 px column the row doesn't have. */}
                    <span className="block text-ink/90 tabular-nums">
                      <span className="whitespace-nowrap">
                        {formatUsd(z.cheapest.value)}
                      </span>{" "}
                      –{" "}
                      <span className="whitespace-nowrap">
                        {formatUsd(z.dearest.value)}
                      </span>
                    </span>
                    <span className="block text-muted text-[11.5px] leading-[1.5] mt-0.5">
                      {z.cheapest.label} · {z.dearest.label}
                    </span>
                  </>
                ) : (
                  "—"
                ),
            },
          ]}
        />
      </div>
    </DataFigure>
  );
}

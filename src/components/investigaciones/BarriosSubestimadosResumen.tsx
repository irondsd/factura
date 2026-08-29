import { DataFigure } from "@/components/figures/DataFigure";
import { DataTable } from "@/components/figures/DataTable";
import {
  CANDIDATES,
  CRIME_YEAR,
  formatArs,
  formatArsPerMetre,
  formatRate,
  PRICE_SAFETY_COVERAGE,
  RENT_PERIOD_LABEL,
} from "@/content/investigaciones/data/barrios-subestimados";

const rounded = (value: number) => Math.round(value).toLocaleString("es-AR");

export function BarriosSubestimadosResumen() {
  return (
    <DataFigure
      header={{
        title: <>Cuatro barrios, cuatro formas de rendir más</>,
        subtitle: (
          <>
            Dos ambientes · alquiler del {RENT_PERIOD_LABEL} · delitos de{" "}
            {CRIME_YEAR}
          </>
        ),
      }}
      caption={
        <>
          El alquiler es el precio pedido para la unidad de referencia, no el
          contrato firmado. Los delitos son hechos registrados cada 1.000
          residentes. «% de Ciudad» compara la tasa del barrio con la tasa
          porteña: menos de 100% es menor.
        </>
      }
      note={
        <>
          El filtro de precio y seguridad puede comparar {PRICE_SAFETY_COVERAGE}{" "}
          de los 48 barrios; IDECBA oculta el alquiler cuando hay pocos avisos.
          Transporte es una lectura de red —modos directos, combinaciones y
          corredores—, no un conteo de paradas que premiaría varias veces al
          mismo recorrido.
        </>
      }
    >
      <div className="overflow-x-auto">
        <DataTable
          className="min-w-[680px]"
          rows={CANDIDATES}
          rowKey={(barrio) => barrio.id}
          columns={[
            {
              header: "Barrio",
              cell: (barrio) => (
                <>
                  <strong className="font-medium text-ink">
                    {barrio.label}
                  </strong>
                  <span className="block text-muted">{barrio.promise}</span>
                </>
              ),
            },
            {
              header: "Alquiler",
              headClassName: "pl-3",
              numeric: true,
              cellClassName: "pl-3",
              cell: (barrio) => (
                <>
                  <span className="text-ink">
                    {formatArs(barrio.rentMonthly)}
                  </span>
                  <span className="block text-muted">
                    {formatArsPerMetre(barrio.rentPerMetre)}
                  </span>
                </>
              ),
            },
            {
              header: "Delitos",
              headClassName: "pl-3",
              numeric: true,
              cellClassName: "pl-3",
              cell: (barrio) => (
                <>
                  <span className="text-ink">
                    {formatRate(barrio.crimeRate)}
                  </span>
                  <span className="block text-muted">
                    {rounded(barrio.crimeRatio * 100)}% de Ciudad
                  </span>
                </>
              ),
            },
            {
              header: "La ventaja que no entra en el precio",
              headClassName: "pl-5",
              cellClassName: "pl-5 text-ink/90",
              cell: (barrio) => barrio.transportLabel,
            },
          ]}
        />
      </div>
    </DataFigure>
  );
}

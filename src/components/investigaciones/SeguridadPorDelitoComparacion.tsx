import { DataFigure } from "@/components/figures/DataFigure";
import { DataTable } from "@/components/figures/DataTable";
import {
  comparison,
  CRIME_YEAR,
  formatArs,
  formatRate,
  RENT_PERIOD_LABEL,
} from "@/content/investigaciones/data/seguridad-por-delito";

export function SeguridadPorDelitoComparacion() {
  const rows = comparison();
  return (
    <DataFigure
      header={{
        title: <>Los perfiles que el promedio esconde</>,
        subtitle: (
          <>
            {rows.length} barrios seleccionados por menor tasa total o por
            liderar una categoría · delitos {CRIME_YEAR} · alquiler de dos
            ambientes del {RENT_PERIOD_LABEL}
          </>
        ),
      }}
      caption={
        <>
          Cada tasa es anual y usa el mismo denominador. El alquiler es un
          precio pedido promedio, no un contrato firmado; «Sin dato» significa
          que IDECBA no publicó un promedio barrial por poca oferta.
        </>
      }
    >
      <div className="overflow-x-auto">
        <DataTable
          className="min-w-[720px]"
          rows={rows}
          rowKey={(r) => r.id}
          columns={[
            {
              header: "Barrio",
              cellClassName: "text-ink",
              cell: (r) => (
                <>
                  {r.label}
                  <span className="block text-muted">{r.meta}</span>
                </>
              ),
            },
            {
              header: "Robos",
              headClassName: "text-right pl-3",
              cellClassName: "text-right pl-3 tabular-nums",
              cell: (r) => formatRate(r.robos),
            },
            {
              header: "Hurtos",
              headClassName: "text-right pl-3",
              cellClassName: "text-right pl-3 tabular-nums",
              cell: (r) => formatRate(r.hurtos),
            },
            {
              header: "Personas",
              headClassName: "text-right pl-3",
              cellClassName: "text-right pl-3 tabular-nums",
              cell: (r) => formatRate(r.personas),
            },
            {
              header: "Total",
              headClassName: "text-right pl-3",
              cellClassName: "text-right pl-3 tabular-nums text-ink",
              cell: (r) => formatRate(r.total),
            },
            {
              header: "Alquiler",
              headClassName: "text-right pl-3",
              cellClassName: "text-right pl-3 tabular-nums",
              cell: (r) =>
                r.rentMonthly === null ? "Sin dato" : formatArs(r.rentMonthly),
            },
          ]}
        />
      </div>
    </DataFigure>
  );
}

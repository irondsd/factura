import { DataFigure } from "@/components/figures/DataFigure";
import { DataTable } from "@/components/figures/DataTable";
import { BARRIOS } from "@/content/shared/caba";
import {
  barrio,
  ciudad,
  DEFAULT_SIZE,
  formatPayback,
  formatYield,
  LAST_UPDATED,
  payback,
  REFERENCE_AREA,
  SIZES,
} from "@/content/estadisticas/data/rentabilidad-caba";

const SIZE = SIZES.find((s) => s.id === DEFAULT_SIZE)!;
const AREA = REFERENCE_AREA[DEFAULT_SIZE];
const DECIMAL = new Intl.NumberFormat("es-AR", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/** Valores seleccionados en el gráfico de rentabilidad del informe mensual.
 * No representan todos los barrios de Zonaprop ni una tabla de extremos. */
const REFERENCE = {
  when: "septiembre de 2026",
  href: "https://www.zonaprop.com.ar/blog/wp-content/uploads/2026/10/INDEX_CABA_REPORTE_2026-09.pdf",
  city: 5.7,
  cityPayback: 17.5,
  area: 50,
  barrios: {
    "villa-lugano": 9.6,
    "parque-patricios": 7.7,
    "nueva-pompeya": 7.6,
    constitucion: 6.8,
    liniers: 6.1,
    "villa-santa-rita": 6.0,
    "villa-del-parque": 5.9,
    "villa-ortuzar": 5.5,
    nunez: 4.6,
    palermo: 4.6,
    "puerto-madero": 3.2,
  } as Record<string, number>,
};

export function RentabilidadContraste() {
  const rows = Object.entries(REFERENCE.barrios)
    .map(([id, theirs]) => {
      const listed = BARRIOS.find((b) => b.id === id);
      if (!listed) throw new Error(`RentabilidadContraste: no barrio "${id}"`);
      return {
        id,
        label: listed.label,
        theirs,
        ours: barrio(id, DEFAULT_SIZE),
      };
    })
    .sort((a, b) => b.theirs - a.theirs);

  const withBoth = rows.filter((row) => row.ours !== null);
  const withoutIDECBA = rows.filter((row) => row.ours === null);
  const oursCity = ciudad(DEFAULT_SIZE);

  return (
    <DataFigure
      header={{
        title: <>Los mismos barrios, medidos por otra fuente</>,
        subtitle: (
          <>
            Zonaprop · {REFERENCE.when} · selección publicada · IDECBA ·{" "}
            {LAST_UPDATED}
          </>
        ),
      }}
      caption={
        <>
          Rentabilidad bruta publicada por Zonaprop para {rows.length} barrios y
          el resultado calculado aquí con precios de IDECBA cuando se publican
          venta y alquiler para el mismo tamaño de departamento.
        </>
      }
      note={
        <>
          El informe de Zonaprop sitúa su promedio de la Ciudad en{" "}
          {formatYield(REFERENCE.city)} ({DECIMAL.format(REFERENCE.cityPayback)} años
          de repago) en {REFERENCE.when}. El cociente de los totales IDECBA para{" "}
          {SIZE.label} en {LAST_UPDATED} es{" "}
          {oursCity === null ? "—" : formatYield(oursCity)}
          {oursCity === null ? "" : ` (${formatPayback(payback(oursCity))})`}.
          Zonaprop usa una referencia de {REFERENCE.area} m² y este cálculo, de{" "}
          {AREA} m². Son períodos y muestras distintos, así que las cifras no son
          una comparación directa. De los {rows.length} barrios seleccionados por
          Zonaprop, hay datos IDECBA para {withBoth.length}; faltan{" "}
          {withoutIDECBA.length}: {withoutIDECBA.map((row, i) => (
            <span key={row.id}>
              {i > 0 && (i === withoutIDECBA.length - 1 ? " y " : ", ")}
              {row.label}
            </span>
          ))}. Fuente: {" "}
          <a
            href={REFERENCE.href}
            rel="nofollow noopener"
            target="_blank"
            className="underline underline-offset-2 hover:text-ink"
          >
            informe mensual de Zonaprop
          </a>
          .
        </>
      }
    >
      <div className="overflow-x-auto">
        <DataTable
          rows={rows}
          rowKey={(row) => row.id}
          columns={[
            {
              header: "Barrio",
              cellClassName: "align-top text-ink",
              cell: (row) => row.label,
            },
            {
              header: `Zonaprop · ${REFERENCE.when}`,
              headClassName: "pl-3",
              numeric: true,
              cellClassName: "pl-3 align-top text-ink",
              cell: (row) => formatYield(row.theirs),
            },
            {
              header: `Cálculo con IDECBA · ${LAST_UPDATED}`,
              headClassName: "pl-3",
              numeric: true,
              cellClassName: "pl-3 align-top text-ink/90",
              cell: (row) =>
                row.ours ? formatYield(row.ours.value) : "—",
            },
          ]}
        />
      </div>

    </DataFigure>
  );
}

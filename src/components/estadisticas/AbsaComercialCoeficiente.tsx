import { DataFigure } from "@/components/figures/DataFigure";
import { DataTable } from "@/components/figures/DataTable";
import {
  COMMERCIAL_SHOCK as S,
  formatCount,
  formatPct,
  formatVm,
  HEARING,
} from "@/content/estadisticas/data/absa-tarifas";

// Decomposes the February 2026 non-residential change into its two factors.

export function AbsaComercialCoeficiente() {
  const rows = [
    {
      id: "residencial",
      label: "Residencial",
      before: S.residentialBefore,
      after: S.residentialAfter,
      change: S.tariffPart,
      detail: "Valor base residencial.",
    },
    {
      id: "coeficiente",
      label: "Coeficiente no residencial",
      before: S.coefBefore,
      after: S.coefAfter,
      change: S.coefPart,
      detail: "Factor para usuarios no residenciales.",
    },
    {
      id: "comercial",
      label: "No residencial",
      before: S.commercialBefore,
      after: S.commercialAfter,
      change: S.total,
      detail: "Valor base por coeficiente.",
    },
  ];

  const fmt = (row: (typeof rows)[number], value: number) =>
    row.id === "coeficiente"
      ? value.toLocaleString("es-AR", { minimumFractionDigits: 1 })
      : formatVm(value);

  return (
    <DataFigure
      header={{
        title: (
          <>
            De dónde sale el {formatPct(S.total).replace("+", "")} de los
            comercios
          </>
        ),
        subtitle: <>Valor del m³ antes y después de febrero de 2026</>,
      }}
      caption={
        <>
          La variación no residencial combina el cambio del valor base y el
          coeficiente aplicable a esa categoría.
        </>
      }
      note={
        <>
          El valor no residencial resulta de multiplicar el valor base por su
          coeficiente, con redondeo a centavos. ABSA informó{" "}
          {formatCount(HEARING.nonResidentialUnits)} unidades no residenciales y{" "}
          {formatCount(HEARING.residentialUnits)} residenciales en la audiencia
          pública. Fuente: DIB, con coeficientes establecidos por los Decretos
          3044/2024 y 127/2026.
        </>
      }
    >
      <div className="overflow-x-auto">
        <DataTable
          rows={rows}
          rowKey={(row) => row.id}
          columns={[
            {
              header: "",
              rowHeader: true,
              cell: (row) => (
                <>
                  <span
                    className={
                      row.id === "comercial" ? "font-semibold" : undefined
                    }
                  >
                    {row.label}
                  </span>
                  <span className="block text-muted">{row.detail}</span>
                </>
              ),
            },
            {
              header: "Enero 2026",
              numeric: true,
              cell: (row) => fmt(row, row.before),
            },
            {
              header: "Febrero 2026",
              numeric: true,
              cell: (row) => fmt(row, row.after),
            },
            {
              header: "Variación",
              numeric: true,
              cellClassName: (row) => row.id === "comercial" && "font-semibold",
              cell: (row) => formatPct(row.change),
            },
          ]}
        />
      </div>
    </DataFigure>
  );
}

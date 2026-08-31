import { DataFigure } from "@/components/figures/DataFigure";
import { DataTable } from "@/components/figures/DataTable";
import {
  COMMERCIAL_SHOCK as S,
  formatCount,
  formatMagnitude,
  formatPct,
  formatVm,
  HEARING,
} from "@/content/estadisticas/data/absa-tarifas";

// Why a comercio's water bill rose almost twice as much as a household's.
//
// The 72 % that circulated in January is real, and it was reported as a second,
// larger increase granted to commercial users. It is not. It is the same 40 %
// increase every residential user got, multiplied by a change nobody covered:
// Decreto 3044/2024 priced a non-residential cubic metre at 1,3 times the
// residential one, and Decreto 127/2026 quietly moved that to 1,6.
//
// The table is three rows because the decomposition is the finding, and it
// closes to the centavo: 196,76 × 1,3 = 255,79 and 275,46 × 1,6 = 440,74. That
// exactness is also the best evidence the reconstructed February values are
// right — two independently reported figures reproducing a coefficient written
// in a decree is not something a misquote does.
//
// Both factors are computed from the dataset rather than written down, so the
// identity cannot drift if a figure is ever corrected.

export function AbsaComercialCoeficiente() {
  const rows = [
    {
      id: "residencial",
      label: "Residencial",
      before: S.residentialBefore,
      after: S.residentialAfter,
      change: S.tariffPart,
      detail: "El valor del m³ que fija la resolución.",
    },
    {
      id: "coeficiente",
      label: "Coeficiente no residencial",
      before: S.coefBefore,
      after: S.coefAfter,
      change: S.coefPart,
      detail:
        "Decreto 3044/2024 lo fijaba en 1,3; Decreto 127/2026 lo llevó a 1,6.",
    },
    {
      id: "comercial",
      label: "No residencial",
      before: S.commercialBefore,
      after: S.commercialAfter,
      change: S.total,
      detail: "El producto de las dos filas anteriores.",
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
          El aumento de los usuarios no residenciales no fue una segunda subida
          más grande: fue la misma de {formatMagnitude(S.tariffPart)}{" "}
          multiplicada por un coeficiente que pasó de{" "}
          {S.coefBefore.toLocaleString("es-AR", {
            minimumFractionDigits: 1,
          })}{" "}
          a {S.coefAfter.toLocaleString("es-AR", { minimumFractionDigits: 1 })}.
          Un comercio absorbió las dos cosas a la vez.
        </>
      }
      note={
        <>
          Las dos primeras filas se multiplican exactamente para dar la tercera,
          y esa es también la mejor prueba de que los valores de febrero están
          bien reconstruidos: {formatVm(S.residentialBefore)} ×{" "}
          {S.coefBefore.toLocaleString("es-AR", { minimumFractionDigits: 1 })}{" "}
          da {formatVm(S.commercialBefore)} y {formatVm(S.residentialAfter)} ×{" "}
          {S.coefAfter.toLocaleString("es-AR", { minimumFractionDigits: 1 })} da{" "}
          {formatVm(S.commercialAfter)}. El cambio de coeficiente alcanza a{" "}
          {formatCount(HEARING.nonResidentialUnits)} unidades no residenciales,
          contra {formatCount(HEARING.residentialUnits)} residenciales, según lo
          que ABSA presentó en la audiencia pública. Fuentes: Decreto 3044/2024
          y Decreto 127/2026.
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

import { DataFigure } from "@/components/figures/DataFigure";
import { DataTable } from "@/components/figures/DataTable";
import {
  ADICIONAL,
  ESCALA,
  formatMillones,
  formatPct,
  formatPesos,
  LEY,
  MINIMO,
  type Segmento,
  SOURCE,
  TASA,
} from "@/content/estadisticas/data/abl-caba";

// The rest of the law's arithmetic, as text: the tasa's three parameters and
// the Impuesto Inmobiliario's ten-segment scale.
//
// It exists so the prose never has to type a rate. The page explains the
// formula in words that survive next year's Ley Impositiva; the values the
// formula takes this year live here, beside the data module they come from.

export function AblParametros() {
  const parametros = [
    {
      id: "ab",
      label: "Alícuota base de la tasa (ab)",
      value: formatPct(TASA.base),
    },
    {
      id: "pcg",
      label: "Ponderación del coeficiente geográfico (pCG)",
      value: String(TASA.weight).replace(".", ","),
    },
    {
      id: "usc",
      label: "Unidad de Sustentabilidad Contributiva (USC)",
      value: String(TASA.usc),
    },
    {
      id: "adicional",
      label: `Adicional sobre la tasa si la VFH supera ${formatPesos(ADICIONAL.threshold)}`,
      value: formatPct(ADICIONAL.rate),
    },
    {
      id: "minimo",
      label: "Mínimo anual por partida (cocheras y bauleras)",
      value: `${formatPesos(MINIMO.general)} (${formatPesos(MINIMO.complementaria)})`,
    },
  ];

  return (
    <DataFigure
      header={{
        title: <>Alícuotas y parámetros del ABL en {LEY.year}</>,
        subtitle: <>Ley {LEY.number}, arts. 41 a 44</>,
      }}
      caption={
        <>
          Los valores con los que se calculan los dos tributos de la boleta. La
          tasa ABL multiplica la VFH por la alícuota base y por el factor del
          coeficiente geográfico; el Impuesto Inmobiliario aplica una escala por
          tramos, en la que cada alícuota recae solo sobre la parte de la VFH
          que excede el límite inferior del tramo.
        </>
      }
      note={
        <>
          La cuota fija de cada tramo es el impuesto que corresponde a todo lo
          que está por debajo de su límite inferior. El Impuesto Inmobiliario ya
          incluye el 5 % de la Ley 23.514 destinado al Fondo del subte. El
          mínimo se reparte en partes iguales entre los dos tributos. Fuente:{" "}
          {SOURCE}.
        </>
      }
    >
      <DataTable
        rows={parametros}
        rowKey={(r) => r.id}
        columns={[
          {
            header: "Tasa ABL",
            rowHeader: true,
            cellClassName: "text-left font-normal pr-3",
            cell: (r) => r.label,
          },
          {
            header: "Valor",
            numeric: true,
            cell: (r) => r.value,
          },
        ]}
      />

      <div className="mt-6 overflow-x-auto">
        <DataTable<Segmento>
          rows={ESCALA}
          rowKey={(s) => s.id}
          columns={[
            {
              header: "Impuesto Inmobiliario",
              rowHeader: true,
              cellClassName: "text-left font-normal pr-3",
              cell: (s) => `Tramo ${s.id}`,
            },
            {
              header: "VFH desde",
              numeric: true,
              cell: (s) => (s.from === 0 ? "$ 0" : formatMillones(s.from)),
            },
            {
              header: "Hasta",
              numeric: true,
              cell: (s) =>
                s.to === null ? (
                  <span className="text-muted">en adelante</span>
                ) : (
                  formatMillones(s.to)
                ),
            },
            {
              header: "Cuota fija",
              numeric: true,
              cell: (s) => formatPesos(s.fixed),
            },
            {
              header: "Alícuota",
              numeric: true,
              cell: (s) => formatPct(s.rate),
            },
          ]}
        />
      </div>
    </DataFigure>
  );
}

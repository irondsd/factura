import { DataFigure } from "@/components/figures/DataFigure";
import Link from "next/link";
import {
  formatArs,
  formatUsd,
  LAST_UPDATED,
  PERIODS,
  periodLabel,
  promedioArs,
  promedioUsd,
  PROVISIONAL,
  SOURCE,
  USD_FROM,
} from "@/content/estadisticas/data/escrituras-pba";
import { MontoChart, type MontoRow } from "./EscriturasChartBody";

// Average amount declared per deed. The aggregate mixes property types, and
// the dollar series can end before the monthly deed series if FX is missing.

/** The extremes of the dollar series, derived rather than named. */
function usdExtremes() {
  const points = PERIODS.map((period) => ({
    period,
    value: promedioUsd(period),
  })).filter((p): p is { period: string; value: number } => p.value !== null);
  if (points.length === 0) return null;
  return {
    high: points.reduce((a, p) => (p.value > a.value ? p : a)),
    low: points.reduce((a, p) => (p.value < a.value ? p : a)),
    last: points[points.length - 1],
  };
}

export function EscriturasMonto() {
  const rows: MontoRow[] = PERIODS.map((period) => {
    const usd = promedioUsd(period);
    return {
      period,
      title: periodLabel(period),
      usd,
      usdLabel: usd === null ? null : formatUsd(usd),
      ars: promedioArs(period),
      arsLabel: formatArs(promedioArs(period)),
      note: PROVISIONAL.has(period)
        ? "Provisorio: todavía se corrige a medida que llegan presentaciones tardías."
        : null,
    };
  });

  const ext = usdExtremes();

  return (
    <DataFigure
      caption={
        <>
          Monto total declarado dividido por la cantidad de compraventas del
          mes. La conversión a dólares llega hasta el último período con datos
          de cotización disponibles.
        </>
      }
      note={
        <>
          El promedio mezcla viviendas, terrenos y cocheras, y cambia tanto por
          los importes declarados como por la composición de las operaciones;
          así que{" "}
          <strong className="font-medium">
            no es el precio de una propiedad
          </strong>{" "}
          y no responde cuánto vale el metro cuadrado; para eso está{" "}
          <Link href="/estadisticas/precio-m2-provincia-buenos-aires">
            el precio del m² en la provincia
          </Link>
          . La conversión a dólares usa el promedio trimestral del dólar blue.
          Fuente: {SOURCE}, datos hasta {LAST_UPDATED}.
        </>
      }
    >
      <MontoChart
        title={`Valor promedio declarado de una escritura en la Provincia de Buenos Aires`}
        statUsd={
          ext ? (
            <>
              <span className="text-ink">{formatUsd(ext.last.value)}</span> en{" "}
              {periodLabel(ext.last.period)} · Máximo{" "}
              {formatUsd(ext.high.value)} ({periodLabel(ext.high.period)}) ·
              Mínimo {formatUsd(ext.low.value)} ({periodLabel(ext.low.period)})
              · desde {USD_FROM ? periodLabel(USD_FROM) : "—"}
            </>
          ) : (
            <>Sin tipo de cambio para convertir la serie.</>
          )
        }
        statArs={
          <>
            <span className="text-ink">{formatArs(promedioArs())}</span> en{" "}
            {LAST_UPDATED} · en pesos corrientes, sin ajustar por inflación
          </>
        }
        rows={rows}
      />
    </DataFigure>
  );
}

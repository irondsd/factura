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

// The secondary cut, and the one that needs the most care.
//
// The Colegio publishes a monto alongside every month's count, so an average
// deed value falls out of dividing one by the other. It is arithmetically
// fine and economically slippery, in two separate ways that the figure's own
// note has to keep saying:
//
//   • It is an average over *everything* — a house in Tigre, a flat in La
//     Plata, a rural plot, a garage. It moves when the mix of what sold moves,
//     not only when prices move. In the depths of 2020-2023 the market that
//     kept transacting was the cheap end of it, and part of the climb since is
//     the expensive end coming back.
//   • The declared value in a deed is the declared value in a deed.
//
// The peso view exists because it is the figure the source actually publishes,
// but as a *curve* across twenty-one years of Argentine inflation it says only
// that Argentina has inflation. The dollar view is the one that answers a
// question, and it starts in 2017 because that is where `dolar.json` starts —
// the alternative was to extend the FX series back to 2005 on the official
// rate, which is the wrong divisor for a market that settles in physical
// dollars.
//
// The server half of the split: the <figure> shell, the caption, the source
// note and every formatted string.

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
          El monto total declarado en las compraventas de cada mes, dividido por
          la cantidad de escrituras. En dólares se puede leer de punta a punta;
          en pesos es el número que publica el Colegio, que sirve para el mes en
          que se publicó y para poco más.
        </>
      }
      note={
        <>
          Es un promedio sobre todo lo que se escrituró: una casa en Tigre, un
          departamento en La Plata, un lote rural y una cochera entran en el
          mismo número. Se mueve tanto por lo que cambia de precio como por lo
          que cambia de mezcla, así que{" "}
          <strong className="font-medium">
            no es el precio de una propiedad
          </strong>{" "}
          y no responde cuánto vale el metro cuadrado —para eso está{" "}
          <Link href="/estadisticas/precio-m2-provincia-buenos-aires">
            el precio del m² en la provincia
          </Link>
          —. Tampoco tiene superficie: en esta fuente no hay metros. La
          conversión a dólares usa el promedio trimestral del dólar blue, que es
          la moneda en la que se pagan las propiedades en Argentina; es una
          conversión más gruesa que un dato diario y la única honesta para una
          serie que atraviesa los años del cepo. Fuente: {SOURCE}, datos hasta{" "}
          {LAST_UPDATED}.
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
              · desde {USD_FROM ? periodLabel(USD_FROM) : "—"}, que es donde
              empieza la serie de tipo de cambio
            </>
          ) : (
            <>Sin tipo de cambio para convertir la serie.</>
          )
        }
        statArs={
          <>
            <span className="text-ink">{formatArs(promedioArs())}</span> en{" "}
            {LAST_UPDATED} · en pesos corrientes, sin corregir por inflación:
            como curva solo muestra que hay inflación
          </>
        }
        rows={rows}
      />
    </DataFigure>
  );
}

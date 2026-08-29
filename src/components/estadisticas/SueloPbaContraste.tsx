import { DataFigure } from "@/components/figures/DataFigure";
import {
  contraste,
  formatUsd,
  VENTA_LAST_UPDATED,
  VINTAGE,
} from "@/content/estadisticas/data/suelo-pba";

// Land against built space, in the 27 partidos that have both prices.
//
// The two datasets on this site that measure a square metre in the Provincia de
// Buenos Aires overlap in exactly these partidos, and the ratio between them is
// a number nobody publishes: how many square metres of land one square metre of
// finished apartment buys. It is a reading of density, not of value — three and
// a half where every plot carries a tower, twenty-four where a plot carries a
// house — and it is the clearest way to show a reader that the two figures on
// this site called "el precio del m²" are not rivals.
//
// ── The caveat is the design ──────────────────────────────────────────────
// The land side was relevado between 2021 and 2024; the apartment side is last
// month's. That mismatch is stated in the heading's own subtitle, repeated in
// the caption, and it is why the rows are sorted by the ratio rather than by
// either price: a table sorted by one column invites reading down it as if it
// were current, and a ratio column has no such reading.
//
// Bars rather than a chart: 27 values, no axis, and a `<div>` whose width is a
// percentage is the whole drawing. It is also plain server-rendered markup, so
// every figure is in the HTML as text.

const RATIO = new Intl.NumberFormat("es-AR", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

export function SueloPbaContraste() {
  const rows = contraste();
  const max = Math.max(...rows.map((r) => r.ratio));

  return (
    <DataFigure
      header={{
        title: <>Cuánta tierra compra un metro cuadrado de departamento</>,
        subtitle: (
          <>
            Terreno relevado entre {VINTAGE} · departamentos de{" "}
            {VENTA_LAST_UPDATED} · {rows.length} partidos con las dos cifras
          </>
        ),
      }}
      caption={
        <>
          Cada barra es el precio del m² de departamento dividido por el precio
          del m² de terreno del mismo partido; debajo del nombre están las dos
          cifras, terreno primero. Un ×3,5 quiere decir que el metro construido
          vale tres veces y media el metro de suelo, y eso pasa donde el suelo
          es escaso y cada lote sostiene varios pisos: Vicente López, San
          Fernando, Tres de Febrero, La Matanza. Un ×20 pasa donde el suelo
          sobra y el lote sostiene una casa, que es lo que separa a Pilar,
          Escobar y Ezeiza del resto. La relación no mide qué tan caro está un
          partido: mide cuánto se construye sobre cada metro de tierra.
        </>
      }
      note={
        <>
          <strong className="text-ink font-normal">
            Las dos columnas no son del mismo momento.
          </strong>{" "}
          El precio del terreno viene de un relevamiento de {VINTAGE} y el de
          los departamentos es de {VENTA_LAST_UPDATED}, así que la relación
          describe una estructura —cuánto hay construido sobre cada lote— y no
          el mercado de este mes. No es un descuento: nadie compra el terreno de
          un departamento por separado, y el precio de una unidad incluye la
          construcción, los años de obra y todo lo demás. Fuentes: Observatorio
          de Valores de Suelo (OVS) para el terreno, Zonaprop para los
          departamentos.
        </>
      }
    >
      <ol className="list-none p-0 m-0 flex flex-col gap-3">
        {rows.map((r) => (
          <li key={r.id} className="flex items-center gap-3">
            {/* Wide enough for "General San Martín" and for a pair of prices
                on one line each — the two longest strings this column ever
                holds. Narrower and both wrap, which turns a 27-row figure into
                a 54-row one. */}
            <span className="w-[152px] shrink-0 min-w-0">
              <span className="block font-mono text-xs text-ink truncate">
                {r.label}
              </span>
              <span className="block font-mono text-[11px] text-muted leading-[1.4] mt-0.5 tabular-nums whitespace-nowrap">
                {formatUsd(r.terreno)} · {formatUsd(r.departamento)}
              </span>
            </span>
            <span className="flex-1 min-w-0 h-3.5 bg-[color-mix(in_srgb,var(--line)_45%,transparent)]">
              <span
                className="block h-full"
                style={{
                  width: `${(r.ratio / max) * 100}%`,
                  background: "var(--choro-4)",
                }}
              />
            </span>
            <span className="w-[46px] shrink-0 text-right font-mono text-xs text-muted tabular-nums">
              ×{RATIO.format(r.ratio)}
            </span>
          </li>
        ))}
      </ol>
    </DataFigure>
  );
}

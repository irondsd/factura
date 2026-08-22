import {
  AS_OF,
  NEIGHBORHOOD_MAX_USD_M2,
  NEIGHBORHOOD_MIN_USD_M2,
  NEIGHBORHOODS,
  SCOPE,
} from "@/content/estadisticas/data/suelo-neuquen";

const NUMBER = new Intl.NumberFormat("es-AR", {
  maximumFractionDigits: 0,
});

const COLORS = [
  "var(--choro-1)",
  "var(--choro-2)",
  "var(--choro-3)",
  "var(--choro-4)",
  "var(--choro-5)",
  "var(--choro-6)",
] as const;

const formatUsd = (value: number): string => `US$ ${NUMBER.format(value)}`;

function colorFor(value: number): string {
  if (value < 100) return COLORS[0];
  if (value < 200) return COLORS[1];
  if (value < 300) return COLORS[2];
  if (value < 450) return COLORS[3];
  if (value < 650) return COLORS[4];
  return COLORS[5];
}

function widthFor(value: number): string {
  return `${Math.max(5, (value / NEIGHBORHOOD_MAX_USD_M2) * 100)}%`;
}

/**
 * A source-dated neighbourhood heatmap with the exact values repeated in an
 * accessible table. The bars are an original visual summary, not a copy of
 * the source site's map or styling.
 */
export function SueloNeuquenBarrios() {
  return (
    <figure className="fd-card my-8 px-5 pt-5 pb-4">
      <figcaption className="mb-4">
        <h3 className="font-mono text-micro uppercase tracking-label-wide text-muted m-0 scroll-mt-24">
          Estimación del suelo por barrio
        </h3>
        <p className="font-mono text-xs text-muted mt-1.5 opacity-85 leading-[1.6]">
          Neuquén Capital · 49 barrios · {AS_OF} · US$ por m²
        </p>
      </figcaption>

      <div aria-hidden="true" className="flex flex-col gap-2">
        {NEIGHBORHOODS.map((row) => (
          <div key={row.id} className="flex items-center gap-2">
            <span className="w-[142px] shrink-0 truncate font-mono text-xs text-ink sm:w-[176px]">
              {row.label}
            </span>
            <span className="h-3 flex-1 min-w-0 bg-[color-mix(in_srgb,var(--line)_45%,transparent)]">
              <span
                className="block h-full"
                style={{
                  width: widthFor(row.usdM2),
                  background: colorFor(row.usdM2),
                }}
              />
            </span>
            <span className="w-[66px] shrink-0 text-right font-mono text-xs text-muted tabular-nums">
              {formatUsd(row.usdM2)}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-4 flex justify-between font-mono text-[11px] text-muted">
        <span>{formatUsd(NEIGHBORHOOD_MIN_USD_M2)}</span>
        <span>{formatUsd(NEIGHBORHOOD_MAX_USD_M2)}</span>
      </div>

      <div className="overflow-x-auto mt-6">
        <table className="w-full border-collapse">
          <caption className="sr-only">
            Tabla exacta de la estimación del precio del suelo por barrio en
            Neuquén Capital, junio de 2026.
          </caption>
          <thead>
            <tr>
              <th scope="col" className="fd-th">
                Barrio
              </th>
              <th scope="col" className="fd-th text-right pl-3">
                Estimación US$/m²
              </th>
            </tr>
          </thead>
          <tbody>
            {NEIGHBORHOODS.map((row) => (
              <tr key={row.id}>
                <th
                  scope="row"
                  className="fd-td text-left align-top font-normal"
                >
                  {row.label}
                </th>
                <td className="fd-td text-right pl-3 align-top text-ink tabular-nums whitespace-nowrap">
                  {formatUsd(row.usdM2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="font-mono text-xs text-muted mt-4 leading-[1.6]">
        El color y el largo de cada barra son una escala visual propia; la tabla
        es la representación exacta. La fuente publica estos valores como una
        mediana de parcelas estimadas por barrio. No son 49 muestras
        independientes ni se promedian para reconstruir la mediana reportada de
        la ciudad.
      </p>

      <p className="font-mono text-[11.5px] text-muted mt-3 leading-[1.6] opacity-85">
        La diferencia espacial va de {formatUsd(NEIGHBORHOOD_MIN_USD_M2)} en
        Colonia Nueva Esperanza a {formatUsd(NEIGHBORHOOD_MAX_USD_M2)} en Santa
        Genoveva. Son estimaciones de oferta de la fuente para {SCOPE}, con
        vintage de {AS_OF}; donde hay pocas publicaciones la precisión es menor.
      </p>
    </figure>
  );
}

import { DataFigure } from "@/components/figures/DataFigure";
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
    <DataFigure
      header={{
        title: <>Estimación del suelo por barrio</>,
        subtitle: <>Neuquén Capital · 49 barrios · {AS_OF} · US$ por m²</>,
      }}
      caption={
        <>
          El color y el largo de cada barra son una escala visual propia; la
          tabla es la representación exacta. La fuente publica estos valores
          como una mediana de parcelas estimadas por barrio. No son 49 muestras
          independientes ni se promedian para reconstruir la mediana reportada
          de la ciudad.
        </>
      }
      note={
        <>
          La diferencia espacial va de {formatUsd(NEIGHBORHOOD_MIN_USD_M2)} en
          Colonia Nueva Esperanza a {formatUsd(NEIGHBORHOOD_MAX_USD_M2)} en
          Santa Genoveva. Son estimaciones de oferta de la fuente para {SCOPE},
          con vintage de {AS_OF}; donde hay pocas publicaciones la precisión es
          menor.
        </>
      }
    >
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
    </DataFigure>
  );
}

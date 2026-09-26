import type { ReviewsMetadata, ReviewSource } from "@/content-system/types";
import { cn } from "@/lib/cn";

// «Opiniones»: what the public platforms say about a company — Google Play,
// the App Store, Trustpilot, Defensa del Consumidor — one row each, with the
// score as a five-cell bar.
//
// The body writes a bare `<Opiniones />` and the route binds it; the numbers
// are `metadata.reviews`, copied by hand from each platform and dated, edited
// in the CMS's «Componentes» tab.
//
// A table from 480px of the block's own width, stacked rows below it: a
// container query rather than a viewport one, for the same reason as the
// company card beside it — the article column and the CMS preview are both
// narrower than the screen.
//
// No `AggregateRating` markup, on purpose. These are other sites' ratings,
// and structured data may only describe reviews the page itself collects.

/** A score under this reads in the accent colour. */
const LOW_SCORE = 2.5;

const scoreFormat = new Intl.NumberFormat("es-AR", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const countFormat = new Intl.NumberFormat("es-AR");
const dateFormat = new Intl.DateTimeFormat("es-AR", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/** "2026-09-26" → "26 sept 2026". Built from the formatter's parts because
 * es-AR's own pattern is "26 de sept de 2026", longer than a footnote wants. */
export function formatReviewDate(iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return iso;
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    dateFormat
      .formatToParts(date)
      .find((entry) => entry.type === type)
      ?.value.replace(/\./g, "") ?? "";
  return `${part("day")} ${part("month")} ${part("year")}`;
}

/** How much of each of the five cells a score fills, 0–100. */
export function cellFills(score: number): number[] {
  return [0, 1, 2, 3, 4].map((i) => Math.max(0, Math.min(1, score - i)) * 100);
}

function Bar({ score, className }: { score: number; className?: string }) {
  const low = score < LOW_SCORE;
  return (
    <div
      aria-hidden="true"
      className={cn("grid grid-cols-5 gap-[3px]", className)}
    >
      {cellFills(score).map((fill, i) => (
        <div key={i} className="relative h-2 overflow-hidden bg-[var(--bone)]">
          <div
            className={cn(
              "absolute inset-y-0 left-0",
              low ? "bg-accent" : "bg-ink",
            )}
            style={{ width: `${fill}%` }}
          />
        </div>
      ))}
    </div>
  );
}

function Score({ score }: { score: number }) {
  return (
    <span className="whitespace-nowrap">
      <span
        className={cn(
          "font-medium",
          score < LOW_SCORE ? "text-accent" : "text-ink",
        )}
      >
        {scoreFormat.format(score)}
      </span>
      <span className="text-muted"> / 5</span>
    </span>
  );
}

function SourceName({ source }: { source: ReviewSource }) {
  if (!source.url) return <span className="text-ink">{source.name}</span>;
  return (
    <a
      href={source.url}
      target="_blank"
      rel="noopener"
      className="inline-flex min-h-6 items-baseline gap-1 text-ink underline decoration-muted decoration-dotted underline-offset-4 transition-colors hover:text-accent hover:decoration-accent @min-[480px]:min-h-0"
    >
      {source.name}
      <span aria-hidden="true" className="text-[11px] text-muted">
        ↗
      </span>
      <span className="sr-only"> (abre en otra pestaña)</span>
    </a>
  );
}

export function Opiniones({
  name,
  value,
}: {
  /** The page's `vendor`, or its title when that is empty. */
  name: string;
  value: ReviewsMetadata | undefined;
}) {
  const sources = value?.sources ?? [];
  if (sources.length === 0) return null;
  const showCount = sources.some((source) => source.count !== undefined);
  const counted = (source: ReviewSource) =>
    source.count !== undefined ? countFormat.format(source.count) : "—";

  return (
    <section
      aria-labelledby="opiniones-bloque"
      className="@container receipt-edge my-10 border border-line bg-card px-6 pt-6 pb-[34px]"
    >
      <div className="mb-5 flex flex-wrap items-baseline justify-between gap-3">
        <h2
          id="opiniones-bloque"
          className="m-0 font-display text-[24px] leading-[1.1] font-semibold tracking-[-0.02em] text-ink"
        >
          Opiniones
        </h2>
        <span className="fd-label">
          {name} · {sources.length}{" "}
          {sources.length === 1 ? "fuente" : "fuentes"}
        </span>
      </div>

      {/* Wide: a table, which is what the numbers are. */}
      <table className="mt-4 hidden w-full border-collapse @min-[480px]:table">
        <thead>
          <tr>
            <th className="fd-th">Fuente</th>
            <th className="fd-th w-[38%]">Calificación</th>
            <th className="fd-th text-right">Nota</th>
            {showCount && <th className="fd-th text-right">Reseñas</th>}
          </tr>
        </thead>
        <tbody>
          {sources.map((source) => (
            <tr key={source.name}>
              <td className="fd-td pr-4">
                <SourceName source={source} />
              </td>
              <td className="fd-td pr-4">
                <Bar score={source.score} className="max-w-[180px]" />
              </td>
              <td className="fd-td text-right">
                <Score score={source.score} />
              </td>
              {showCount && (
                <td className="fd-td text-right whitespace-nowrap text-muted">
                  {counted(source)}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>

      {/* Narrow: one stacked row per platform. */}
      <ul className="m-0 mt-2 flex list-none flex-col p-0 @min-[480px]:hidden">
        {sources.map((source) => (
          <li
            key={source.name}
            className="flex flex-col gap-2.5 border-t border-line/60 py-3.5"
          >
            <div className="flex items-baseline justify-between gap-3 text-[13px]">
              <span className="min-w-0">
                <SourceName source={source} />
              </span>
              <Score score={source.score} />
            </div>
            <Bar score={source.score} />
            {showCount && source.count !== undefined && (
              <span className="fd-label">{counted(source)} reseñas</span>
            )}
          </li>
        ))}
      </ul>

      <p className="mt-[18px] mb-0 text-[12px] text-pretty text-muted">
        Datos públicos de cada plataforma
        {value?.updated
          ? ` · actualizado ${formatReviewDate(value.updated)}`
          : ""}
        . Factura no modera ni filtra estas reseñas.
      </p>
    </section>
  );
}

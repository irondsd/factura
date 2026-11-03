import type {
  FinancialChartData,
  FinancialsMetadata,
} from "@/content-system/metadata/financials";

const number = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 });
const compact = new Intl.NumberFormat("es-AR", {
  notation: "compact",
  maximumFractionDigits: 1,
});

/** The chart and its text alternative share the exact same values. Straight
 * segments preserve annual observations; gaps never imply interpolation. */
export function FinancialChart({ chart }: { chart: FinancialChartData }) {
  const values = chart.points.flatMap(({ value }) =>
    value === null ? [] : [value],
  );
  const low = Math.min(0, ...values);
  const high = Math.max(0, ...values) || (low === 0 ? 1 : 0);
  const span = high - low || 1;
  const first = chart.points[0].year;
  const last = chart.points[chart.points.length - 1].year;
  const x = (year: number) => 74 + ((year - first) / (last - first)) * 590;
  const y = (value: number) => 24 + ((high - value) / span) * 204;
  const ticks = [high, high - span / 2, low];
  return (
    <figure className="my-8 min-w-0 border border-line bg-paper p-4 sm:p-6">
      <figcaption>
        <h3 className="mt-0 mb-2 text-xl text-ink">{chart.title}</h3>
        <p className="m-0 text-sm text-muted">
          {chart.entity} · {chart.unit}
        </p>
      </figcaption>
      <p className="my-3 text-sm text-ink">{chart.basis}</p>
      <div
        className="overflow-x-auto"
        role="region"
        aria-label={`Gráfico de ${chart.title}`}
        tabIndex={0}
      >
        <svg
          viewBox="0 0 688 266"
          className="h-auto w-full min-w-[480px]"
          role="img"
          aria-label={`${chart.title}, ${first} a ${last}. Valores en la tabla siguiente.`}
        >
          {ticks.map((tick, index) => (
            <g key={index}>
              <line
                x1="74"
                x2="664"
                y1={y(tick)}
                y2={y(tick)}
                stroke="var(--line)"
              />
              <text
                x="64"
                y={y(tick) + 4}
                textAnchor="end"
                fontSize="12"
                fill="var(--muted)"
              >
                {compact.format(tick)}
              </text>
            </g>
          ))}
          <line
            x1="74"
            x2="664"
            y1={y(0)}
            y2={y(0)}
            stroke="var(--ink)"
            strokeOpacity="0.4"
          />
          {chart.points.map((point, index) => {
            if (point.value === null) return null;
            const previous = chart.points[index - 1];
            return (
              <g key={point.year}>
                {previous?.value != null &&
                  previous.year === point.year - 1 && (
                    <line
                      x1={x(previous.year)}
                      x2={x(point.year)}
                      y1={y(previous.value)}
                      y2={y(point.value)}
                      stroke="var(--accent)"
                      strokeWidth="2.5"
                    />
                  )}
                <circle
                  cx={x(point.year)}
                  cy={y(point.value)}
                  r="4"
                  fill="var(--accent)"
                >
                  <title>{`${point.year}: ${number.format(point.value)} ${chart.unit}`}</title>
                </circle>
                {(index === 0 ||
                  index === chart.points.length - 1 ||
                  chart.points.length <= 12 ||
                  index % Math.ceil(chart.points.length / 8) === 0) && (
                  <text
                    x={x(point.year)}
                    y="254"
                    textAnchor="middle"
                    fontSize="12"
                    fill="var(--muted)"
                  >
                    {point.year}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
      <p className="mt-2 mb-0 text-xs text-muted sm:hidden">
        Deslizá el gráfico para ver todos los ejercicios. La tabla muestra la
        serie completa.
      </p>
      <p className="my-3 text-sm text-muted">{chart.note}</p>
      <table className="w-full text-sm">
        <caption className="sr-only">
          {chart.title} ({chart.unit})
        </caption>
        <thead>
          <tr>
            <th scope="col" className="border-b border-line py-2 text-left">
              Ejercicio
            </th>
            <th scope="col" className="border-b border-line py-2 text-right">
              {chart.unit}
            </th>
          </tr>
        </thead>
        <tbody>
          {chart.points.map((point) => (
            <tr key={point.year}>
              <th
                scope="row"
                className="border-b border-line/50 py-2 text-left font-normal"
              >
                {point.year}
              </th>
              <td className="border-b border-line/50 py-2 text-right tabular-nums">
                {point.value === null ? "Sin dato" : number.format(point.value)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <ul className="mt-4 mb-0 list-none space-y-2 p-0 text-sm text-muted">
        {chart.sources.map((source, index) => (
          <li key={index}>
            <a href={source.href} className="underline underline-offset-4">
              {source.label}
            </a>
            {source.note ? `: ${source.note}` : ""}
          </li>
        ))}
      </ul>
    </figure>
  );
}

export function IndicadoresFinancieros({
  value,
}: {
  value?: FinancialsMetadata;
}) {
  if (!value?.charts.length) return null;
  return (
    <section aria-label="Indicadores financieros">
      <p className="text-sm text-muted">
        Datos revisados el {value.updated.split("-").reverse().join("/")} ·
        Series anuales
      </p>
      {value.charts.map((chart, index) => (
        <FinancialChart key={index} chart={chart} />
      ))}
    </section>
  );
}

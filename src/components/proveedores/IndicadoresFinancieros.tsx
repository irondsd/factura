"use client";

import { useState } from "react";
import type {
  FinancialChartData,
  FinancialsMetadata,
  UsdConversion,
} from "@/content-system/metadata/financials";

const number = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 });
const exchangeRate = new Intl.NumberFormat("es-AR", {
  maximumFractionDigits: 4,
});
const displayDate = (date: string) => date.split("-").reverse().join("/");

const compact = new Intl.NumberFormat("es-AR", {
  notation: "compact",
  maximumFractionDigits: 1,
});

/** The chart and its text alternative share the exact same values. Straight
 * segments preserve annual observations; gaps never imply interpolation. */
export function FinancialChart({
  chart,
  conversion,
  currency = "ARS",
}: {
  chart: FinancialChartData;
  conversion?: UsdConversion;
  currency?: "ARS" | "USD";
}) {
  const rates = new Map(conversion?.rates.map((rate) => [rate.year, rate]));
  const converted = chart.points.map((point) => {
    const rate = rates.get(point.year)?.arsPerUsd;
    return {
      ...point,
      value: point.value !== null && rate ? point.value / rate : null,
    };
  });
  const points = currency === "USD" && conversion ? converted : chart.points;
  const unit =
    currency === "USD" && conversion ? "millones de USD" : chart.unit;
  const values = points.flatMap(({ value }) => (value === null ? [] : [value]));
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
          {chart.entity} · {unit}
        </p>
      </figcaption>
      <p className="my-3 text-sm text-ink">
        {currency === "USD" && conversion
          ? "Base de los importes originales: "
          : null}
        {chart.basis}
      </p>
      <div
        className="overflow-x-auto"
        role="region"
        aria-label={`Gráfico de ${chart.title} en ${unit}`}
        tabIndex={0}
      >
        <svg
          viewBox="0 0 688 266"
          className="h-auto w-full min-w-[480px]"
          role="img"
          aria-label={`${chart.title}, ${first} a ${last}, ${unit}. Valores en la tabla siguiente.`}
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
          {points.map((point, index) => {
            if (point.value === null) return null;
            const previous = points[index - 1];
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
                  <title>{`${point.year}: ${number.format(point.value)} ${unit}`}</title>
                </circle>
              </g>
            );
          })}
          {points.map(
            (point, index) =>
              (index === 0 ||
                index === points.length - 1 ||
                points.length <= 12 ||
                index % Math.ceil(points.length / 8) === 0) && (
                <text
                  key={point.year}
                  x={x(point.year)}
                  y="254"
                  textAnchor="middle"
                  fontSize="12"
                  fill="var(--muted)"
                >
                  {point.year}
                </text>
              ),
          )}
        </svg>
      </div>
      <p className="mt-2 mb-0 text-xs text-muted sm:hidden">
        Deslizá el gráfico para ver todos los ejercicios. La tabla muestra la
        serie completa.
      </p>
      <p className="my-3 text-sm text-muted">{chart.note}</p>
      <div
        className="overflow-x-auto"
        role="region"
        aria-label={`Tabla de ${chart.title}`}
        tabIndex={0}
      >
        <table className="w-full text-sm">
          <caption className="sr-only">
            {chart.title} ({chart.unit}
            {conversion ? " y millones de USD" : ""})
          </caption>
          <thead>
            <tr>
              <th scope="col" className="border-b border-line py-2 text-left">
                Ejercicio
              </th>
              <th scope="col" className="border-b border-line py-2 text-right">
                {chart.unit}
              </th>
              {conversion && (
                <>
                  <th
                    scope="col"
                    className="border-b border-line py-2 pl-4 text-right"
                  >
                    millones de USD
                  </th>
                  <th
                    scope="col"
                    className="border-b border-line py-2 pl-4 text-right"
                  >
                    ARS por USD / fecha
                  </th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {chart.points.map((point, index) => (
              <tr key={point.year}>
                <th
                  scope="row"
                  className="border-b border-line/50 py-2 text-left font-normal"
                >
                  {point.year}
                </th>
                <td className="border-b border-line/50 py-2 text-right tabular-nums">
                  {point.value === null
                    ? "Sin dato"
                    : number.format(point.value)}
                </td>
                {conversion && (
                  <>
                    <td className="border-b border-line/50 py-2 pl-4 text-right tabular-nums">
                      {converted[index].value === null
                        ? "Sin dato"
                        : number.format(converted[index].value)}
                    </td>
                    <td className="border-b border-line/50 py-2 pl-4 text-right tabular-nums">
                      {rates.has(point.year) ? (
                        <>
                          <span className="block whitespace-nowrap">
                            {exchangeRate.format(
                              rates.get(point.year)!.arsPerUsd,
                            )}
                          </span>
                          <span className="block whitespace-nowrap text-xs text-muted">
                            {displayDate(rates.get(point.year)!.date)}
                          </span>
                        </>
                      ) : (
                        "Sin cotización"
                      )}
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}

export function IndicadoresFinancieros({
  value,
}: {
  value?: FinancialsMetadata;
}) {
  const [currency, setCurrency] = useState<"ARS" | "USD">("ARS");
  if (!value?.charts.length) return null;
  return (
    <section aria-label="Indicadores financieros">
      <p className="text-sm text-muted">
        Datos revisados el {value.updated.split("-").reverse().join("/")} ·
        Series anuales
      </p>
      {value.usdConversion && (
        <div className="my-4">
          <div
            role="group"
            aria-label="Moneda de los gráficos"
            className="flex flex-wrap gap-2"
          >
            {(["ARS", "USD"] as const).map((unit) => (
              <button
                key={unit}
                type="button"
                aria-pressed={currency === unit}
                onClick={() => setCurrency(unit)}
                className={`min-h-11 cursor-pointer border border-ink px-4 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent ${currency === unit ? "bg-ink text-paper" : "bg-paper text-ink"}`}
              >
                {unit === "ARS" ? "Pesos (ARS)" : "Dólares (USD)"}
              </button>
            ))}
          </div>
          <p className="my-3 text-sm text-muted">{value.usdConversion.basis}</p>
        </div>
      )}
      {value.charts.map((chart, index) => (
        <FinancialChart
          key={index}
          chart={chart}
          conversion={value.usdConversion}
          currency={currency}
        />
      ))}
    </section>
  );
}

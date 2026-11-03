"use client";

import type {
  FinancialChartData,
  FinancialsMetadata,
} from "@/content-system/metadata/financials";
import { AddEntry, inputClass, RemoveEntry } from "./controls";

/** No thousands separators: accepting them would make 1.234 ambiguous.
 * Keep invalid text in the draft so saving reports it instead of losing it. */
export function parseFinancialValue(raw: string): number | null | string {
  const text = raw.trim();
  if (!text) return null;
  if (!/^-?\d+(?:[.,]\d+)?$/.test(text)) return raw;
  const number = Number(text.replace(",", "."));
  return Number.isFinite(number) ? number : raw;
}

const EMPTY_CHART: FinancialChartData = {
  title: "",
  entity: "",
  unit: "",
  basis: "",
  note: "",
  points: [],
};

export function FinancialsInput({
  value,
  onChange,
}: {
  value?: FinancialsMetadata;
  onChange: (next: FinancialsMetadata | undefined) => void;
}) {
  const charts = value?.charts ?? [];
  const emit = (next: FinancialChartData[]) =>
    onChange({ ...value, updated: value?.updated ?? "", charts: next });
  const update = (index: number, patch: Partial<FinancialChartData>) =>
    emit(
      charts.map((chart, i) => (i === index ? { ...chart, ...patch } : chart)),
    );
  return (
    <div className="grid gap-4">
      <label className="grid gap-1 text-sm">
        Fecha de revisión
        <input
          type="date"
          className={inputClass}
          value={value?.updated ?? ""}
          onChange={(e) =>
            onChange({ ...value, charts, updated: e.target.value })
          }
        />
      </label>
      <p className="m-0 text-sm text-muted">
        Un gráfico por indicador y entidad. Copiá los valores en la unidad
        indicada, sin separadores de miles. Usá coma o punto decimal. Dejá el
        valor vacío si falta el dato. Compará ejercicios completos con la misma
        base contable.
      </p>
      <p className="m-0 text-sm text-muted">
        Los enlaces a los informes y al tipo de cambio se editan una sola vez en
        Fuentes.
      </p>
      <label className="flex min-h-11 items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={Boolean(value?.usdConversion)}
          onChange={(e) =>
            onChange({
              ...value,
              updated: value?.updated ?? "",
              charts,
              usdConversion: e.target.checked
                ? {
                    basis: "",
                    rates: [
                      ...new Set(
                        charts.flatMap((chart) =>
                          chart.points.map((point) => point.year),
                        ),
                      ),
                    ]
                      .sort((a, b) => a - b)
                      .map((year) => ({
                        year,
                        date: `${year}-12-31`,
                        arsPerUsd: 0,
                      })),
                  }
                : undefined,
            })
          }
        />
        Mostrar equivalentes en USD (importes originales en millones de ARS)
      </label>
      {value?.usdConversion && (
        <fieldset className="min-w-0 space-y-3 border border-line p-3">
          <legend className="px-1 text-sm">Conversión a USD</legend>
          <label className="grid gap-1 text-sm">
            Método y límites de comparación
            <textarea
              className={inputClass}
              value={value.usdConversion.basis}
              onChange={(e) =>
                onChange({
                  ...value,
                  usdConversion: {
                    ...value.usdConversion!,
                    basis: e.target.value,
                  },
                })
              }
            />
          </label>
          {value.usdConversion.rates.map((rate, index) => (
            <div
              key={index}
              className="grid gap-2 border-t border-line pt-2 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end"
            >
              {(["year", "date", "arsPerUsd"] as const).map((key) => (
                <label key={key} className="grid min-w-0 gap-1 text-sm">
                  {key === "year"
                    ? "Ejercicio del tipo de cambio"
                    : key === "date"
                      ? "Fecha de cotización"
                      : "ARS por USD"}
                  <input
                    className={inputClass}
                    type={key === "date" ? "date" : "text"}
                    inputMode={
                      key === "date"
                        ? undefined
                        : key === "year"
                          ? "numeric"
                          : "decimal"
                    }
                    value={key === "arsPerUsd" ? rate[key] || "" : rate[key]}
                    onChange={(e) =>
                      onChange({
                        ...value,
                        usdConversion: {
                          ...value.usdConversion!,
                          rates: value.usdConversion!.rates.map((item, row) =>
                            row === index
                              ? {
                                  ...item,
                                  [key]:
                                    key === "date"
                                      ? e.target.value
                                      : key === "year"
                                        ? /^\d{4}$/.test(e.target.value)
                                          ? Number(e.target.value)
                                          : e.target.value
                                        : parseFinancialValue(e.target.value),
                                }
                              : item,
                          ) as NonNullable<
                            FinancialsMetadata["usdConversion"]
                          >["rates"],
                        },
                      })
                    }
                  />
                </label>
              ))}
              <RemoveEntry
                label={`Quitar cotización ${index + 1}`}
                onClick={() =>
                  onChange({
                    ...value,
                    usdConversion: {
                      ...value.usdConversion!,
                      rates: value.usdConversion!.rates.filter(
                        (_, row) => row !== index,
                      ),
                    },
                  })
                }
              />
            </div>
          ))}
          {value.usdConversion.rates.length < 60 && (
            <AddEntry
              onClick={() => {
                const year =
                  Number(value.usdConversion!.rates.at(-1)?.year ?? 2017) + 1;
                onChange({
                  ...value,
                  usdConversion: {
                    ...value.usdConversion!,
                    rates: [
                      ...value.usdConversion!.rates,
                      { year, date: `${year}-12-31`, arsPerUsd: 0 },
                    ],
                  },
                });
              }}
            >
              Añadir cotización
            </AddEntry>
          )}
        </fieldset>
      )}
      {charts.map((chart, index) => (
        <fieldset
          key={index}
          className="min-w-0 space-y-3 border border-line p-3"
        >
          <legend className="px-1 text-sm">Gráfico {index + 1}</legend>
          <RemoveEntry
            label={`Quitar el gráfico ${index + 1}`}
            onClick={() => {
              const next = charts.filter((_, i) => i !== index);
              onChange(
                next.length
                  ? { ...value, updated: value?.updated ?? "", charts: next }
                  : undefined,
              );
            }}
          />
          {(
            [
              ["title", "Indicador"],
              ["entity", "Razón social y alcance (separado o consolidado)"],
              ["unit", "Unidad (ej.: millones de ARS)"],
              [
                "basis",
                "Base contable y moneda (ej.: pesos constantes de diciembre de 2025)",
              ],
              ["note", "Definición del indicador y límites de comparación"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="grid gap-1 text-sm">
              {label}
              <input
                className={inputClass}
                value={chart[key]}
                onChange={(e) => update(index, { [key]: e.target.value })}
              />
            </label>
          ))}
          <div className="grid gap-2">
            {chart.points.map((point, row) => (
              <div
                key={row}
                className="grid grid-cols-[1fr_1fr_auto] items-end gap-2"
              >
                <label className="grid min-w-0 gap-1 text-sm">
                  Ejercicio
                  <input
                    className={inputClass}
                    inputMode="numeric"
                    value={point.year}
                    onChange={(e) =>
                      update(index, {
                        points: chart.points.map((p, i) =>
                          i === row
                            ? {
                                ...p,
                                year: (/^\d{4}$/.test(e.target.value)
                                  ? Number(e.target.value)
                                  : e.target.value) as number,
                              }
                            : p,
                        ),
                      })
                    }
                  />
                </label>
                <label className="grid min-w-0 gap-1 text-sm">
                  Valor
                  <input
                    className={inputClass}
                    inputMode="decimal"
                    value={point.value ?? ""}
                    onChange={(e) =>
                      update(index, {
                        points: chart.points.map((p, i) =>
                          i === row
                            ? {
                                ...p,
                                value: parseFinancialValue(e.target.value) as
                                  | number
                                  | null,
                              }
                            : p,
                        ),
                      })
                    }
                  />
                </label>
                <RemoveEntry
                  label={`Quitar el ejercicio ${row + 1} del gráfico ${index + 1}`}
                  onClick={() =>
                    update(index, {
                      points: chart.points.filter((_, i) => i !== row),
                    })
                  }
                />
              </div>
            ))}
            {chart.points.length < 60 && (
              <AddEntry
                onClick={() =>
                  update(index, {
                    points: [
                      ...chart.points,
                      {
                        year: chart.points.length
                          ? Number(chart.points[chart.points.length - 1].year) +
                            1
                          : 2018,
                        value: null,
                      },
                    ],
                  })
                }
              >
                Añadir ejercicio
              </AddEntry>
            )}
          </div>
        </fieldset>
      ))}
      {charts.length < 8 && (
        <AddEntry onClick={() => emit([...charts, { ...EMPTY_CHART }])}>
          Añadir gráfico
        </AddEntry>
      )}
    </div>
  );
}

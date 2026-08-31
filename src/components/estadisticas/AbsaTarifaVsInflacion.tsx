import { DataFigure } from "@/components/figures/DataFigure";
import {
  CURRENT_REAL,
  formatMagnitude,
  formatPct,
  formatPeriod,
  IPC_SOURCE,
  LAST_STEP,
  MONTHS,
  PEAK_REAL,
  REAL_THROUGH,
  SOURCE,
  WORST_LAG,
} from "@/content/estadisticas/data/absa-tarifas";
import { BrechaChart, type BrechaRow } from "./AbsaChartBody";

// The figure the page exists for.
//
// Read on its own, the tariff series says water got much more expensive. Read
// against general prices it says something better and less obvious: the tariff
// spent fourteen months losing ground — {WORST_LAG} behind by November 2025 —
// and February 2026 was not simply an increase but a correction that overshot.
// The sawtooth is the whole picture, and it is also the argument for the change
// of frequency buried in Decreto 127/2026: a value updated three times a year
// against 2–3 % monthly inflation cannot help but sawtooth.
//
// ── Two views, and why the gap is the default ────────────────────────────
// «Las dos series» is the honest raw view: two lines from a common base. But
// two rising lines are hard to read against each other precisely when it
// matters — the gap between them in late 2025 is a few percent of a value that
// has doubled, and the eye cannot measure it. «Contra la inflación» plots the
// difference directly, which is the quantity every sentence on the page is
// about, so that is what opens.
//
// The deflator is the *general* level, not division 04, which contains water:
// see the note on `IPC` in the dataset.

export function AbsaTarifaVsInflacion() {
  const rows: BrechaRow[] = MONTHS.map((m) => ({
    period: m.period,
    title: formatPeriod(m.period),
    tarifa: Number(m.nominalIndex.toFixed(1)),
    ipc: m.ipcIndex === null ? null : Number(m.ipcIndex.toFixed(1)),
    brecha: m.realGap === null ? null : Number(m.realGap.toFixed(1)),
    tarifaLabel: m.nominalIndex.toLocaleString("es-AR", {
      maximumFractionDigits: 1,
    }),
    ipcLabel:
      m.ipcIndex === null
        ? null
        : m.ipcIndex.toLocaleString("es-AR", { maximumFractionDigits: 1 }),
    brechaLabel: m.realGap === null ? null : formatPct(m.realGap),
  }));

  return (
    <DataFigure
      caption={
        <>
          Las dos series arrancan en 100 en diciembre de 2024, cuando empieza el
          régimen de actualización por fórmula. Por encima de la línea la tarifa
          le ganó a los precios en general desde entonces; por debajo, se quedó
          atrás. El piso es {formatPeriod(WORST_LAG.period)}, con la tarifa{" "}
          {formatMagnitude(WORST_LAG.realGap)} por detrás, y el techo es{" "}
          {formatPeriod(PEAK_REAL.period)}, el mes en que se aplicó el aumento
          del 40 %.
        </>
      }
      note={
        <>
          El deflactor es el nivel general del IPC, no el capítulo de vivienda y
          servicios: ese capítulo incluye el agua, así que medir esta tarifa
          contra él aplanaría justamente lo que la figura quiere mostrar. La
          serie de tarifas llega hasta {formatPeriod(LAST_STEP.period)} y la del
          IPC hasta {formatPeriod(REAL_THROUGH)}, porque un decreto se publica
          antes de aplicarse y la inflación se conoce después: la comparación
          termina en el último mes que tienen en común. Fuentes: {SOURCE} y{" "}
          {IPC_SOURCE}.
        </>
      }
    >
      <BrechaChart
        title="La tarifa de ABSA contra la inflación, con diciembre de 2024 = 100"
        stat={
          <>
            <span className="text-ink">{formatPct(CURRENT_REAL.realGap)}</span>{" "}
            contra los precios en general en {formatPeriod(CURRENT_REAL.period)}{" "}
            · mínimo {formatPct(WORST_LAG.realGap)} en{" "}
            {formatPeriod(WORST_LAG.period)} · máximo{" "}
            {formatPct(PEAK_REAL.realGap)} en {formatPeriod(PEAK_REAL.period)}
          </>
        }
        rows={rows}
      />
    </DataFigure>
  );
}

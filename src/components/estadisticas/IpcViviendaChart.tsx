import { DataFigure } from "@/components/figures/DataFigure";
import {
  byPeriod,
  getRegion,
  interanual,
  LAST_UPDATED,
  LAST_YEAR,
  monthlyRange,
  monthlyYear,
  periodLabel,
  periodTick,
  type RegionId,
  REGION_IDS,
  YEARS,
} from "@/content/estadisticas/data/ipc-vivienda";
import {
  InteranualChart,
  MensualChart,
  type Range,
  type Row,
} from "./IpcChartBody";

// The fourteen figures of /estadisticas/inflacion: one interannual and one
// monthly chart for each of the seven series in the IPC dataset. An .mdx page
// places one with
//
//   <IpcViviendaChart region="gba" variacion="mensual" />
//
// and nothing else — no numbers, no imports, no props to get wrong.
//
// This half is a *server* component: it owns the captions and the source note,
// picks the region's series out of the dataset, and shapes it into the plain
// rows the interactive half takes. Everything that reacts to a click lives in
// ./IpcChartBody.tsx, which also carries the figure's heading — see the note
// there for why the two are split at that seam rather than at the plot.

type Mode = "interanual" | "mensual";

/** The blurb under each figure. Region-specific: these are the pages' search
 * surface, and each region is looked for by the names of its own provinces and
 * cities. Written out per figure rather than templated — the phrasing differs
 * enough between regions that a template would fight every one of them. */
const CAPTION: Record<Mode, Record<RegionId, string>> = {
  interanual: {
    nacional:
      "Evolución anual del IPC de vivienda, agua, electricidad, gas y otros combustibles en Argentina. Muestra cómo cambiaron los precios de estos servicios y el aumento de gas, luz y electricidad a lo largo del tiempo.",
    gba: "Evolución anual del IPC de vivienda, agua, electricidad, gas y otros combustibles en el Gran Buenos Aires. Los datos permiten analizar el aumento de gas en Buenos Aires, así como la evolución de los precios de electricidad, vivienda y servicios.",
    pampeana:
      "Evolución anual del IPC de vivienda, agua, electricidad, gas y otros combustibles en la región Pampeana. La región comprende áreas de Buenos Aires, Córdoba, Santa Fe, Entre Ríos y La Pampa, e incluye el aumento de gas en Córdoba, Santa Fe y La Pampa y en localidades como Rosario, Mar del Plata, Bahía Blanca, Tandil, Necochea y Olavarría.",
    noreste:
      "Evolución anual del IPC de vivienda, agua, electricidad, gas y otros combustibles en el Noreste argentino (Corrientes, Chaco, Formosa y Misiones). Muestra la evolución de los precios de vivienda, electricidad, gas y otros combustibles en la región.",
    noroeste:
      "Evolución anual del IPC de vivienda, agua, electricidad, gas y otros combustibles en el Noroeste argentino (Catamarca, Jujuy, La Rioja, Salta, Santiago del Estero y Tucumán). Incluye la evolución de los precios de gas, electricidad, vivienda y otros combustibles.",
    cuyo: "Evolución anual del IPC de vivienda, agua, electricidad, gas y otros combustibles en Cuyo (Mendoza, San Juan y San Luis). Consulta la evolución de los precios y del aumento de gas en Mendoza, junto con los cambios en electricidad, vivienda y otros combustibles.",
    patagonia:
      "Evolución anual del IPC de vivienda, agua, electricidad, gas y otros combustibles en la Patagonia (Río Negro, Neuquén, Chubut, Santa Cruz y Tierra del Fuego). Sigue el aumento de gas en la Patagonia, provincia por provincia, y en localidades como Bariloche, Esquel, Trelew y Ushuaia.",
  },
  mensual: {
    nacional:
      "Variación mensual del IPC de vivienda, agua, electricidad, gas y otros combustibles en Argentina. Consulta cuánto subió el gas y la electricidad y cómo evolucionaron los precios de luz y gas mes a mes.",
    gba: "Variación mensual del IPC de vivienda, agua, electricidad, gas y otros combustibles en el Gran Buenos Aires. Consulta la evolución del aumento de electricidad, gas y vivienda mes a mes en Buenos Aires.",
    pampeana:
      "Variación mensual del IPC de vivienda, agua, electricidad, gas y otros combustibles en la región Pampeana. Consulta la evolución del aumento de gas y electricidad mes a mes en áreas como Córdoba, Santa Fe, Entre Ríos, La Pampa y el interior de Buenos Aires.",
    noreste:
      "Variación mensual del IPC de vivienda, agua, electricidad, gas y otros combustibles en el Noreste argentino. Consulta cómo cambian los precios de vivienda, luz y gas y otros servicios de la región mes a mes.",
    noroeste:
      "Variación mensual del IPC de vivienda, agua, electricidad, gas y otros combustibles en el Noroeste argentino. Consulta la evolución mensual de los precios de gas y electricidad en Salta, Jujuy, Tucumán y otras provincias de la región.",
    cuyo: "Variación mensual del IPC de vivienda, agua, electricidad, gas y otros combustibles en Cuyo. Consulta cómo evolucionan mes a mes los precios de gas y electricidad en Mendoza, San Juan y San Luis.",
    patagonia:
      "Variación mensual del IPC de vivienda, agua, electricidad, gas y otros combustibles en la Patagonia. Consulta la evolución mensual del aumento de gas y electricidad en Río Negro, Neuquén, Chubut, Santa Cruz y Tierra del Fuego, incluyendo localidades como Bariloche, Esquel, Trelew y Ushuaia.",
  },
};

const NOTE: Record<Mode, string> = {
  interanual:
    "Variación interanual: cada mes contra el mismo mes del año anterior. Un 50 % quiere decir que los precios de la división son un 50 % más altos que doce meses antes. Todas las regiones se grafican en la misma escala, para que los gráficos se puedan comparar entre sí.",
  mensual:
    "Variación mensual: cada mes contra el mes anterior. Es el número que el INDEC publica cada mes. La escala se ajusta al año elegido y es la misma para las siete regiones, así que los gráficos de un mismo año se pueden comparar entre sí.",
};

export function IpcViviendaChart({
  region,
  variacion,
}: {
  region: RegionId;
  variacion: Mode;
}) {
  const { inTitle } = getRegion(region);
  const title =
    variacion === "interanual"
      ? `Aumento de vivienda, agua, electricidad y gas en ${inTitle}`
      : `Aumento mensual de vivienda, agua, electricidad y gas en ${inTitle}`;

  const interanualSeries =
    variacion === "interanual" ? interanualRows(region) : undefined;

  return (
    <DataFigure
      note={
        <>
          {NOTE[variacion]} Fuente: INDEC, datos hasta {LAST_UPDATED}.
        </>
      }
    >
      {interanualSeries ? (
        <InteranualChart
          title={title}
          rows={interanualSeries}
          range={INTERANUAL_RANGE}
        />
      ) : (
        <MensualChart
          title={title}
          years={[...YEARS]}
          initialYear={LAST_YEAR}
          byYear={monthlyRows(region)}
          ranges={MONTHLY_RANGES}
          label={`Año del gráfico: ${title}`}
        />
      )}

      <p className="font-mono text-xs text-muted mt-3 leading-[1.6]">
        {CAPTION[variacion][region]}
      </p>
    </DataFigure>
  );
}

// ── the rows handed to the client ──────────────────────────────────────────
// Plain serialisable data, shaped here so the client component holds no
// knowledge of the dataset. `label` is what the axis prints and `title` what a
// tooltip does — abbreviated on the axis, where there is room for six
// characters, spelled out in the tooltip, where there is room for the month.
//
// Both builders attach both measures to every row, whichever one their chart
// plots, because the tooltip shows the pair — see `Row` in ./IpcChartBody.tsx.

function interanualRows(region: RegionId): Row[] {
  const { mensual } = byPeriod(region);
  const { periods, values } = interanual(region);
  return periods.map((period, i) => ({
    key: period,
    label: periodTick(period),
    title: periodLabel(period),
    value: values[i],
    mensual: mensual.get(period) as number,
    interanual: values[i],
  }));
}

function monthlyRows(region: RegionId): Record<number, Row[]> {
  const { interanual: ia } = byPeriod(region);
  return Object.fromEntries(
    YEARS.map((year) => [
      year,
      monthlyYear(region, year).map((p) => ({
        key: p.period,
        label: p.label,
        title: periodLabel(p.period),
        value: p.value,
        mensual: p.value,
        interanual: ia.get(p.period),
      })),
    ]),
  );
}

/** The interannual axis, shared by all seven regions, and the monthly axis,
 * shared by all seven within each year. Both are computed once per module load
 * rather than per figure — fourteen figures asking the same question of the same
 * frozen array should ask it once. */
const INTERANUAL_RANGE = (() => {
  const all = REGION_IDS.flatMap((r) => interanual(r).values);
  return { min: Math.min(0, ...all), max: Math.max(0, ...all) };
})();

const MONTHLY_RANGES: Record<number, Range> = Object.fromEntries(
  YEARS.map((year) => [year, monthlyRange(year)]),
);

import { DataFigure } from "@/components/figures/DataFigure";
import { DataTable, type DataColumn } from "@/components/figures/DataTable";
import {
  breakdown,
  CITY_POPULATION,
  cityCount,
  cityRate,
  formatCount,
  formatPct,
  formatPer100k,
  formatRateBare,
  LAST_YEAR,
  YEARS,
} from "@/content/estadisticas/data/delitos-caba";

// The page's opening figure in text form: what the city recorded last year, by
// type, with the change against the year before.
//
// It sits above the map because a reader arriving from a search for "estadística
// de delitos en CABA" wants the city's number before they want their barrio's,
// and because the map's colours mean nothing until you know what the average
// they are measured against is.
//
// Every number here is read from the dataset. Nothing in the prose around it
// quotes a figure — see AUTHORING.md §5 — so a refresh moves the table and
// leaves the sentences alone.

const HOMICIDIOS = "homicidios";

/** The two tables are the same four columns over two halves of the same
 * breakdown — the five that sum to the total, and the two that deliberately do
 * not — so they are one column set with one heading swapped. */
function breakdownColumns(
  previous: number | undefined,
  first = "Tipo de hecho",
): DataColumn<ReturnType<typeof breakdown>[number]>[] {
  return [
    { header: first, cellClassName: "text-ink", cell: (r) => r.label },
    {
      header: "Hechos",
      headClassName: "text-right pl-3",
      numeric: true,
      cellClassName: "pl-3 text-ink",
      cell: (r) => formatCount(r.count),
    },
    {
      header: "Cada 1.000 hab.",
      headClassName: "text-right pl-3",
      numeric: true,
      cellClassName: "pl-3 text-ink/90",
      // Homicide is the one line nobody reads per 1.000: at 78 a year in a city
      // of three million it rounds to 0,0, and the rate everyone quotes and
      // compares internationally is per 100.000.
      cell: (r) =>
        r.id === HOMICIDIOS
          ? formatPer100k(r.count, CITY_POPULATION)
          : formatRateBare(r.rate),
    },
    {
      header: <>Contra {previous}</>,
      headClassName: "text-right pl-3",
      numeric: true,
      cellClassName: "pl-3 text-muted",
      cell: (r) => (r.change === null ? "—" : formatPct(r.change)),
    },
  ];
}

export function DelitosResumen() {
  const rows = breakdown();
  const total = cityCount();
  const previous = YEARS[YEARS.length - 2];
  const change = previous === undefined ? null : cityCount("total", previous);

  return (
    <DataFigure
      header={{
        title: (
          <>Delitos registrados en la Ciudad de Buenos Aires, {LAST_YEAR}</>
        ),
        subtitle: (
          <>
            <span className="text-ink">{formatCount(total)} hechos</span> ·{" "}
            {formatRateBare(cityRate())} cada 1.000 habitantes
            {change !== null && (
              <>
                {" "}
                · {formatPct(total / change - 1)} contra {previous}
              </>
            )}
          </>
        ),
      }}
      caption={
        <>
          Todo lo que el sistema de seguridad de la Ciudad registró en{" "}
          {LAST_YEAR}, con cuánto se movió cada tipo de hecho contra el año
          anterior.
        </>
      }
      note={
        <>
          Las cinco primeras filas suman el total; las dos de abajo, no. El robo
          y el hurto de vehículos ya están contados dentro de robos y hurtos, y
          se muestran aparte porque son la pregunta de quien tiene auto. Los
          siniestros viales quedan fuera del total a propósito: la fuente los
          publica en el mismo archivo porque los registra el mismo sistema, pero
          un choque no es un delito y sumarlos movería el mapa por el motivo
          equivocado.
        </>
      }
    >
      <div className="overflow-x-auto">
        <DataTable
          rows={rows.filter((r) => r.inTotal)}
          rowKey={(r) => r.id}
          columns={breakdownColumns(previous)}
          footer={
            <tr>
              <td className="fd-td text-ink font-semibold">Total</td>
              <td className="fd-td fd-num pl-3 text-ink font-semibold">
                {formatCount(total)}
              </td>
              <td className="fd-td fd-num pl-3 text-ink font-semibold">
                {formatRateBare(cityRate())}
              </td>
              <td className="fd-td fd-num pl-3 text-muted">
                {change === null ? "—" : formatPct(total / change - 1)}
              </td>
            </tr>
          }
        />
      </div>

      <div className="overflow-x-auto mt-6">
        <DataTable
          rows={rows.filter((r) => !r.inTotal)}
          rowKey={(r) => r.id}
          columns={breakdownColumns(previous, "Aparte del total")}
        />
      </div>
    </DataFigure>
  );
}

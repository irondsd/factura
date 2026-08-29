import { DataFigure } from "@/components/figures/DataFigure";
import { DataTable } from "@/components/figures/DataTable";
import {
  flotante,
  formatCount,
  formatRatio,
  formatShare,
  LAST_YEAR,
} from "@/content/estadisticas/data/delitos-caba";

// The argument the rest of the page depends on: a crime rate per resident is not
// a risk to a resident, because in half of this city most of the people present
// are not residents.
//
// Each row puts a barrio's share of the city's recorded crime next to its share
// of the city's residents. The barrios at the top of the map are, almost without
// exception, the ones with the largest gap — the microcentro, the terminals, the
// nightlife strips. The barrios at the bottom are residential and nothing else.
//
// It is placed straight after the map for a reason: on its own the map invites
// exactly one wrong reading ("San Nicolás is nine times more dangerous than
// Agronomía"), and this is the correction. Ten rows rather than 48 — the full
// list is the map's own table, and what this figure has to show is the shape of
// the two ends.

/** How many barrios to show at each end. Enough to make the pattern obvious,
 * few enough that the figure stays a figure rather than a second table. */
const SHOWN = 6;

export function DelitosResidentes() {
  const all = flotante("barrios");
  const top = all.slice(0, SHOWN);
  const bottom = all.slice(-SHOWN).reverse();

  return (
    <DataFigure
      header={{
        title: <>Dónde se registran los delitos y dónde vive la gente</>,
        subtitle: (
          <>
            Participación de cada barrio en los delitos de la Ciudad contra su
            participación en la población · {LAST_YEAR}
          </>
        ),
      }}
      caption={
        <>
          Un barrio con el {formatShare(top[0].shareCrime)} de los delitos y el{" "}
          {formatShare(top[0].sharePeople)} de los habitantes no es un barrio
          donde a sus vecinos les roben {formatRatio(top[0].ratio)} más. Es un
          barrio al que va mucha más gente de la que vive en él.
        </>
      }
      note={
        <>
          Las dos columnas se calculan sobre los{" "}
          {formatCount(all.reduce((a, r) => a + r.count, 0))} hechos que la
          fuente pudo ubicar en un barrio, así que cada una suma 100 %. La
          tercera es su cociente, y es exactamente lo que colorea el mapa de
          arriba. No existe un dato público de población flotante por barrio en
          CABA, así que esta tabla muestra la brecha sin poder corregirla: es el
          motivo por el que la tasa por habitante conviene leerla como «cuánto
          delito se registra aquí» y no como «cuánto riesgo corro si vivo aquí».
        </>
      }
    >
      <div className="overflow-x-auto">
        <DataTable
          groups={[
            { key: "top", label: "Más delitos que habitantes", rows: top },
            { key: "bottom", label: "Más habitantes que delitos", rows: bottom }, // prettier-ignore
          ]}
          rowKey={(r) => r.id}
          columns={[
            {
              header: "Barrio",
              cell: (r) => (
                <>
                  <span className="text-ink">{r.label}</span>
                  <span className="text-muted"> · {r.meta}</span>
                </>
              ),
            },
            {
              header: "% de los delitos",
              headClassName: "pl-3",
              numeric: true,
              cellClassName: "pl-3 text-ink",
              cell: (r) => formatShare(r.shareCrime),
            },
            {
              header: "% de la población",
              headClassName: "pl-3",
              numeric: true,
              cellClassName: "pl-3 text-ink/90",
              cell: (r) => formatShare(r.sharePeople),
            },
            {
              header: "Veces",
              headClassName: "pl-3",
              numeric: true,
              cellClassName: "pl-3 text-muted",
              cell: (r) => formatRatio(r.ratio),
            },
          ]}
        />
      </div>
    </DataFigure>
  );
}

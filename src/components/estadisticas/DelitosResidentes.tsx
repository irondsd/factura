import { Fragment } from "react";
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
    <figure className="fd-card my-8 px-5 pt-5 pb-4">
      <figcaption className="mb-4">
        <h3 className="font-mono text-micro uppercase tracking-label-wide text-muted m-0 scroll-mt-24">
          Dónde se registran los delitos y dónde vive la gente
        </h3>
        <p className="font-mono text-xs text-muted mt-1.5 opacity-85 leading-[1.6]">
          Participación de cada barrio en los delitos de la Ciudad contra su
          participación en la población · {LAST_YEAR}
        </p>
      </figcaption>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="fd-th">Barrio</th>
              <th className="fd-th text-right pl-3">% de los delitos</th>
              <th className="fd-th text-right pl-3">% de la población</th>
              <th className="fd-th text-right pl-3">Veces</th>
            </tr>
          </thead>
          <tbody>
            {[
              { key: "top", label: "Más delitos que habitantes", rows: top },
              { key: "bottom", label: "Más habitantes que delitos", rows: bottom }, // prettier-ignore
            ].map((group) => (
              <Fragment key={group.key}>
                <tr>
                  <td
                    colSpan={4}
                    className="font-mono text-micro uppercase tracking-label-wide text-muted pt-4 pb-1"
                  >
                    {group.label}
                  </td>
                </tr>
                {group.rows.map((r) => (
                  <tr key={r.id}>
                    <td className="fd-td">
                      <span className="text-ink">{r.label}</span>
                      <span className="text-muted"> · {r.meta}</span>
                    </td>
                    <td className="fd-td text-right pl-3 text-ink tabular-nums whitespace-nowrap">
                      {formatShare(r.shareCrime)}
                    </td>
                    <td className="fd-td text-right pl-3 text-ink/90 tabular-nums whitespace-nowrap">
                      {formatShare(r.sharePeople)}
                    </td>
                    <td className="fd-td text-right pl-3 text-muted tabular-nums whitespace-nowrap">
                      {formatRatio(r.ratio)}
                    </td>
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <p className="font-mono text-xs text-muted mt-4 leading-[1.6]">
        Un barrio con el {formatShare(top[0].shareCrime)} de los delitos y el{" "}
        {formatShare(top[0].sharePeople)} de los habitantes no es un barrio
        donde a sus vecinos les roben {formatRatio(top[0].ratio)} más. Es un
        barrio al que va mucha más gente de la que vive en él.
      </p>

      <p className="font-mono text-[11.5px] text-muted mt-3 leading-[1.6] opacity-85">
        Las dos columnas se calculan sobre los{" "}
        {formatCount(all.reduce((a, r) => a + r.count, 0))} hechos que la fuente
        pudo ubicar en un barrio, así que cada una suma 100 %. La tercera es su
        cociente, y es exactamente lo que colorea el mapa de arriba. No existe
        un dato público de población flotante por barrio en CABA, así que esta
        tabla muestra la brecha sin poder corregirla: es el motivo por el que la
        tasa por habitante conviene leerla como «cuánto delito se registra aquí»
        y no como «cuánto riesgo corro si vivo aquí».
      </p>
    </figure>
  );
}

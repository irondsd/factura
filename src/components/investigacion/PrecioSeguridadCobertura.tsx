import {
  coverage,
  CRIME_YEAR,
  DEFAULT_SIZE,
  formatRate,
  SIZES,
} from "@/content/investigacion/data/alquiler-seguridad";

// What the ranking cannot see, named one by one.
//
// This is the figure that keeps the page from lying by omission. Every barrio
// above needs a published rent, and the source withholds one wherever too few
// units are advertised — which is not random. It happens at both ends of the
// city: on the cheap periphery, and in the small, quiet barrios where almost
// nothing is on the market. Several of the latter are among the calmest in the
// Ciudad and would very likely sit near the top of the ranking if they could be
// priced at all.
//
// So the missing list is ordered by *safety rank among all 48 barrios*, not
// alphabetically. Read that way it stops being an apology and becomes the
// second-best thing the page has to offer a reader: a short list of quiet
// barrios where the market is thin enough that the price is worth asking about
// in person.

const SIZE = SIZES.find((s) => s.id === DEFAULT_SIZE)!;

/** How far up the city's safety ranking a missing barrio has to sit before the
 * page calls it out by name in prose. The top quartile of 48 is 12. */
const NOTABLE = 12;

export function PrecioSeguridadCobertura() {
  const cov = coverage("barrios");
  if (cov.missing.length === 0) return null;

  const quiet = cov.missing.filter((m) => m.safetyRank <= NOTABLE);

  return (
    <figure className="fd-card my-8 px-5 pt-5 pb-4">
      <figcaption className="mb-4">
        <h3 className="font-mono text-micro uppercase tracking-label-wide text-muted m-0 scroll-mt-24">
          Los barrios que este ranking no puede ver
        </h3>
        <p className="font-mono text-xs text-muted mt-1.5 opacity-85 leading-[1.6]">
          {cov.missing.length} de {cov.total} barrios sin alquiler publicado
          para {SIZE.inTitle}, ordenados del más tranquilo al que más hechos
          registra
        </p>
      </figcaption>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="fd-th">Barrio</th>
              <th className="fd-th text-right pl-3">
                Puesto en seguridad, de {cov.total}
              </th>
              <th className="fd-th text-right pl-3">Delitos</th>
            </tr>
          </thead>
          <tbody>
            {cov.missing.map((m) => (
              <tr key={m.id}>
                <td className="fd-td">
                  <span className="text-ink">{m.label}</span>
                  <span className="text-muted"> · {m.meta}</span>
                </td>
                <td className="fd-td text-right pl-3 text-ink/90 tabular-nums whitespace-nowrap">
                  {m.safetyRank}.º
                </td>
                <td className="fd-td text-right pl-3 text-muted tabular-nums whitespace-nowrap">
                  {formatRate(m.crimeRate)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {quiet.length > 0 && (
        <p className="font-mono text-xs text-muted mt-4 leading-[1.6]">
          Vale la pena leer las primeras filas al derecho:{" "}
          <strong className="font-medium text-ink">
            {quiet.map((m) => m.label).join(", ")}
          </strong>{" "}
          {quiet.length === 1 ? "está" : "están"} entre los {NOTABLE} barrios
          más tranquilos de la Ciudad y no{" "}
          {quiet.length === 1 ? "aparece" : "aparecen"} en ninguna tabla de esta
          página. No es que puntúen mal: es que no hay suficientes departamentos
          publicados como para ponerles precio. Si lo que se busca es
          tranquilidad, son exactamente los barrios que conviene preguntar a
          mano.
        </p>
      )}

      <p className="font-mono text-[11.5px] text-muted mt-3 leading-[1.6] opacity-85">
        El organismo no publica el alquiler de un barrio cuando la cantidad de
        avisos del trimestre es demasiado chica para promediarla, y eso pasa
        tanto en la periferia barata como en los barrios chicos y quietos. La
        columna de delitos sí existe para los 48: un hecho registrado nunca se
        suprime, así que el puesto en seguridad se calcula sobre la Ciudad
        entera, con datos de {CRIME_YEAR}. La cobertura además cambia con el
        tamaño del departamento —para tres ambientes faltan más barrios que para
        uno—, así que esta lista es la de {SIZE.inTitle}.
      </p>
    </figure>
  );
}

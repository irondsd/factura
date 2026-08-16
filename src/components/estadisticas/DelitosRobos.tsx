import {
  FIRST_YEAR,
  formatCount,
  formatShare,
  LAST_YEAR,
  robos,
  SOURCE,
} from "@/content/estadisticas/data/delitos-caba";

// How a robbery happens, which is the only thing in this dataset that isn't
// about where or when.
//
// The source flags two things on each record beyond the offence type: whether a
// firearm was involved and whether a motorcycle was. That second flag is the
// reason this figure exists — the motochorro is the most-discussed crime in
// Buenos Aires, and this is the only public count of how often a motorcycle
// actually shows up in a robbery report.
//
// A table rather than a chart, deliberately. Both series are shares in a narrow
// band, drawn they would be two slow curves nobody can read a level off, and the
// years either side of the pandemic are exactly the ones a reader wants exact
// rather than eyeballed. Ten rows is short enough to print whole, which also
// means no row has to be dropped and explained.

export function DelitosRobos() {
  const rows = robos();
  const first = rows[0];
  const last = rows[rows.length - 1];

  return (
    <figure className="fd-card my-8 px-5 pt-5 pb-4">
      <figcaption className="mb-4">
        <h3 className="font-mono text-micro uppercase tracking-label-wide text-muted m-0 scroll-mt-24">
          Cómo se roba en la Ciudad: moto y arma
        </h3>
        <p className="font-mono text-xs text-muted mt-1.5 opacity-85 leading-[1.6]">
          En {last.year} aparece una moto en el{" "}
          <span className="text-ink">{formatShare(last.shareMoto)}</span> de los
          robos registrados y un arma en el{" "}
          <span className="text-ink">{formatShare(last.shareArma)}</span> · en{" "}
          {first.year} eran {formatShare(first.shareMoto)} y{" "}
          {formatShare(first.shareArma)}
        </p>
      </figcaption>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="fd-th">Año</th>
              <th className="fd-th text-right pl-3">Robos</th>
              <th className="fd-th text-right pl-3">Con moto</th>
              <th className="fd-th text-right pl-3">Con arma</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.year}>
                <td className="fd-td text-ink tabular-nums">{r.year}</td>
                <td className="fd-td text-right pl-3 text-ink/90 tabular-nums whitespace-nowrap">
                  {formatCount(r.count)}
                </td>
                <td className="fd-td text-right pl-3 text-ink tabular-nums whitespace-nowrap">
                  {formatShare(r.shareMoto)}
                </td>
                <td className="fd-td text-right pl-3 text-ink tabular-nums whitespace-nowrap">
                  {formatShare(r.shareArma)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="font-mono text-xs text-muted mt-4 leading-[1.6]">
        Qué proporción de los robos registrados en la Ciudad involucró una moto y
        cuál un arma, año por año desde {FIRST_YEAR}. Las dos columnas se leen
        contra la primera, que es cuántos robos hubo: una proporción puede caer
        porque el fenómeno se achicó o porque el denominador creció.
      </p>

      <p className="font-mono text-[11.5px] text-muted mt-3 leading-[1.6] opacity-85">
        Son proporciones sobre los robos, no sobre el total de delitos: el hurto
        —sin violencia— no lleva ninguna de las dos marcas. Que un hecho quede
        registrado con moto o con arma depende de lo que consta en la denuncia,
        así que estas cifras son un piso y no un recuento. Fuente: {SOURCE},
        datos hasta {LAST_YEAR}.
      </p>
    </figure>
  );
}

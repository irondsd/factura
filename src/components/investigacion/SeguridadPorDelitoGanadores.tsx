import {
  CRIME_YEAR,
  formatRate,
  safestByType,
} from "@/content/investigacion/data/seguridad-por-delito";

export function SeguridadPorDelitoGanadores() {
  const groups = safestByType();
  return (
    <figure className="fd-card my-8 px-5 pt-5 pb-4">
      <figcaption className="mb-4">
        <h3 className="font-mono text-micro uppercase tracking-label-wide text-muted m-0 scroll-mt-24">
          El barrio más calmo cambia con el delito
        </h3>
        <p className="font-mono text-xs text-muted mt-1.5 opacity-85 leading-[1.6]">
          Tasas de hechos registrados cada 1.000 residentes · {CRIME_YEAR}
        </p>
      </figcaption>
      <div className="grid gap-5 md:grid-cols-3">
        {groups.map(({ type, rows }) => (
          <section key={type.id}>
            <h4 className="font-mono text-xs text-ink m-0">{type.label}</h4>
            <p className="font-mono text-[11.5px] text-muted mt-1 leading-[1.5]">
              {type.detail}
            </p>
            <ol className="mt-3 space-y-2 pl-5">
              {rows.map((row) => (
                <li key={row.id} className="font-mono text-xs text-ink">
                  <span>{row.label}</span>
                  <span className="float-right tabular-nums text-muted">
                    {formatRate(row[type.id])}
                  </span>
                </li>
              ))}
            </ol>
          </section>
        ))}
      </div>
      <p className="font-mono text-xs text-muted mt-5 leading-[1.6]">
        No son probabilidades personales: el divisor es la población residente.
        En barrios de fuerte circulación diaria, sobre todo el centro, esa tasa
        puede sobrestimar la exposición de quien vive allí.
      </p>
    </figure>
  );
}

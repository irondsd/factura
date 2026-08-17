import {
  CANDIDATES,
  formatArsPerMetre,
  formatRate,
} from "@/content/investigacion/data/barrios-subestimados";

export function BarriosSubestimadosPerfiles() {
  return (
    <div className="grid sm:grid-cols-2 gap-4 my-8">
      {CANDIDATES.map((barrio, index) => (
        <article key={barrio.id} className="fd-card p-5 flex flex-col">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-mono text-micro uppercase tracking-label-wide text-accent m-0">
                Elección {index + 1}
              </p>
              <h3 className="font-display font-semibold text-[25px] tracking-[-0.02em] leading-tight mt-2 mb-0">
                {barrio.label}
              </h3>
            </div>
            <div className="font-mono text-xs text-right tabular-nums text-muted shrink-0">
              <span className="block text-ink">{formatArsPerMetre(barrio.rentPerMetre)}</span>
              <span>{formatRate(barrio.crimeRate)} delitos</span>
            </div>
          </div>

          <p className="font-display text-[17px] leading-snug text-ink/85 mt-4 mb-0">
            {barrio.promise}
          </p>
          <dl className="font-mono text-xs leading-[1.55] mt-5 space-y-3">
            <div>
              <dt className="uppercase tracking-label-wide text-muted">Mejor para</dt>
              <dd className="text-ink/90 mt-1">{barrio.bestFor}</dd>
            </div>
            <div>
              <dt className="uppercase tracking-label-wide text-muted">Lo que entrega</dt>
              <dd className="text-ink/90 mt-1">{barrio.upside}</dd>
            </div>
            <div>
              <dt className="uppercase tracking-label-wide text-muted">Lo que cobra</dt>
              <dd className="text-ink/90 mt-1">{barrio.tradeoff}</dd>
            </div>
            <div>
              <dt className="uppercase tracking-label-wide text-muted">Próximos años</dt>
              <dd className="text-ink/90 mt-1">{barrio.outlook}</dd>
            </div>
          </dl>
        </article>
      ))}
    </div>
  );
}


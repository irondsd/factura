const OUT = [
  {
    barrio: "Flores",
    reason: "Casi entró",
    detail:
      "Alquiler bajo, Línea A, Sarmiento y el TramBus en obra. Quedó afuera porque su tasa de delitos supera la de la Ciudad y su ventaja se parece demasiado a la de Balvanera, con menos combinaciones.",
  },
  {
    barrio: "Villa Urquiza",
    reason: "Bueno, no subestimado",
    detail:
      "Es muy tranquilo, tiene subte y tren y suma un nuevo parque ferroviario. El mercado ya reconoce casi todo eso: está entre los alquileres más caros del conjunto comparable.",
  },
  {
    barrio: "Parque Chas y Agronomía",
    reason: "No alcanza el dato",
    detail:
      "Están entre los barrios más tranquilos y ofrecen tejido residencial y verde, pero IDECBA no publica un alquiler comparable por falta de avisos suficientes. Excluirlos es una limitación, no un juicio negativo.",
  },
  {
    barrio: "Puerto Madero",
    reason: "La tasa engaña y el precio decide",
    detail:
      "La tasa por residente se distorsiona por su población flotante, pero aun corrigiendo eso no pasa la prueba de valor: precio alto y conectividad pública débil hacen difícil llamarlo subestimado.",
  },
];

export function BarriosSubestimadosContraste() {
  return (
    <figure className="fd-card my-8 px-5 pt-5 pb-4">
      <figcaption className="mb-4">
        <h3 className="font-mono text-micro uppercase tracking-label-wide text-muted m-0 scroll-mt-24">
          Los que quedaron en la puerta —y por qué
        </h3>
        <p className="font-mono text-xs text-muted mt-1.5 opacity-85 leading-[1.6]">
          La prueba contra la selección: un candidato cercano, uno ya valorado,
          dos sin cobertura y un falso atajo.
        </p>
      </figcaption>
      <div className="divide-y divide-line">
        {OUT.map((item) => (
          <div
            key={item.barrio}
            className="grid sm:grid-cols-[190px_1fr] gap-2 sm:gap-5 py-3 first:pt-0"
          >
            <div>
              <strong className="font-mono text-sm font-medium text-ink">
                {item.barrio}
              </strong>
              <span className="block font-mono text-micro uppercase tracking-label-wide text-accent mt-1">
                {item.reason}
              </span>
            </div>
            <p className="font-mono text-xs leading-[1.65] text-muted m-0">
              {item.detail}
            </p>
          </div>
        ))}
      </div>
    </figure>
  );
}

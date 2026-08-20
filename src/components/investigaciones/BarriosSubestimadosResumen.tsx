import {
  CANDIDATES,
  CRIME_YEAR,
  formatArs,
  formatArsPerMetre,
  formatRate,
  PRICE_SAFETY_COVERAGE,
  RENT_PERIOD_LABEL,
} from "@/content/investigaciones/data/barrios-subestimados";

const rounded = (value: number) => Math.round(value).toLocaleString("es-AR");

export function BarriosSubestimadosResumen() {
  return (
    <figure className="fd-card my-8 px-5 pt-5 pb-4">
      <figcaption className="mb-4">
        <h3 className="font-mono text-micro uppercase tracking-label-wide text-muted m-0 scroll-mt-24">
          Cuatro barrios, cuatro formas de rendir más
        </h3>
        <p className="font-mono text-xs text-muted mt-1.5 opacity-85 leading-[1.6]">
          Dos ambientes · alquiler del {RENT_PERIOD_LABEL} · delitos de{" "}
          {CRIME_YEAR}
        </p>
      </figcaption>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[680px] border-collapse">
          <thead>
            <tr>
              <th className="fd-th">Barrio</th>
              <th className="fd-th text-right pl-3">Alquiler</th>
              <th className="fd-th text-right pl-3">Delitos</th>
              <th className="fd-th pl-5">
                La ventaja que no entra en el precio
              </th>
            </tr>
          </thead>
          <tbody>
            {CANDIDATES.map((barrio) => (
              <tr key={barrio.id}>
                <td className="fd-td">
                  <strong className="font-medium text-ink">
                    {barrio.label}
                  </strong>
                  <span className="block text-muted">{barrio.promise}</span>
                </td>
                <td className="fd-td text-right pl-3 tabular-nums whitespace-nowrap">
                  <span className="text-ink">
                    {formatArs(barrio.rentMonthly)}
                  </span>
                  <span className="block text-muted">
                    {formatArsPerMetre(barrio.rentPerMetre)}
                  </span>
                </td>
                <td className="fd-td text-right pl-3 tabular-nums whitespace-nowrap">
                  <span className="text-ink">
                    {formatRate(barrio.crimeRate)}
                  </span>
                  <span className="block text-muted">
                    {rounded(barrio.crimeRatio * 100)}% de Ciudad
                  </span>
                </td>
                <td className="fd-td pl-5 text-ink/90">
                  {barrio.transportLabel}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="font-mono text-xs text-muted mt-4 leading-[1.6]">
        El alquiler es el precio pedido para la unidad de referencia, no el
        contrato firmado. Los delitos son hechos registrados cada 1.000
        residentes. «% de Ciudad» compara la tasa del barrio con la tasa
        porteña: menos de 100% es menor.
      </p>
      <p className="font-mono text-[11.5px] text-muted mt-3 leading-[1.6] opacity-85">
        El filtro de precio y seguridad puede comparar {PRICE_SAFETY_COVERAGE}{" "}
        de los 48 barrios; IDECBA oculta el alquiler cuando hay pocos avisos.
        Transporte es una lectura de red —modos directos, combinaciones y
        corredores—, no un conteo de paradas que premiaría varias veces al mismo
        recorrido.
      </p>
    </figure>
  );
}

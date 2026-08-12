import {
  DEFAULT_SIZE,
  formatUsd,
  LAST_UPDATED,
  SIZES,
  zonas,
} from "@/content/estadisticas/data/venta-caba";

// The city in four rows: norte, centro, oeste and sur.
//
// Nobody publishes this. IDECBA publishes barrios and comunas, and "zona norte"
// has no boundary — so every figure here is ours, computed from published
// barrio prices over a grouping of whole comunas that the reader can see and
// argue with (see `ZONAS` in data/caba.ts).
//
// Two decisions worth stating, because both are what keeps the row honest:
//
//   • the middle barrio, not an average. IDECBA weights its city total by how
//     many units were advertised, which we can't reproduce, and a plain mean of
//     barrios would put Puerto Madero's ~6.000 dollars a metre into the centro
//     row and move it by a third on its own;
//   • the two ends are named. A zone is not a price, it is a spread, and a
//     reader whose barrio is at one end deserves to see that the row they are
//     reading covers both.

const SIZE = SIZES.find((s) => s.id === DEFAULT_SIZE)!;

export function PrecioPorZona() {
  const rows = zonas(DEFAULT_SIZE);

  return (
    <figure className="fd-card my-8 px-5 pt-5 pb-4">
      <figcaption className="mb-4">
        <h3 className="font-mono text-micro uppercase tracking-label-wide text-muted m-0 scroll-mt-24">
          Precio del metro cuadrado por zona de la Ciudad
        </h3>
        <p className="font-mono text-xs text-muted mt-1.5 opacity-85 leading-[1.6]">
          Departamentos usados de {SIZE.inTitle} · {LAST_UPDATED}
        </p>
      </figcaption>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="fd-th">Zona</th>
              <th className="fd-th text-right pl-3">Barrio del medio</th>
              <th className="fd-th text-right pl-3">
                Del más barato al más caro
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((z) => (
              <tr key={z.id}>
                <td className="fd-td align-top">
                  <span className="text-ink">{z.label}</span>
                  <span className="block text-muted text-[11.5px] leading-[1.5] mt-0.5">
                    {z.comunas} · {z.withData} de {z.total} barrios con dato
                  </span>
                </td>
                <td className="fd-td text-right pl-3 tabular-nums whitespace-nowrap text-ink align-top">
                  {z.median === null ? "—" : formatUsd(z.median)}
                </td>
                <td className="fd-td text-right pl-3 align-top">
                  {z.cheapest && z.dearest ? (
                    <>
                      {/* Each price unbreakable, the pair breakable: on a phone
                          the range wraps after the dash instead of forcing a
                          ~170 px column the row doesn't have. */}
                      <span className="block text-ink/90 tabular-nums">
                        <span className="whitespace-nowrap">
                          {formatUsd(z.cheapest.value)}
                        </span>{" "}
                        –{" "}
                        <span className="whitespace-nowrap">
                          {formatUsd(z.dearest.value)}
                        </span>
                      </span>
                      <span className="block text-muted text-[11.5px] leading-[1.5] mt-0.5">
                        {z.cheapest.label} · {z.dearest.label}
                      </span>
                    </>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="font-mono text-xs text-muted mt-4 leading-[1.6]">
        El valor del metro cuadrado por zona en CABA: cuánto cuesta en el norte,
        en el centro, en el oeste y en el sur de la Ciudad, y qué distancia hay
        entre el barrio más caro y el más barato de cada una.
      </p>

      <p className="font-mono text-[11.5px] text-muted mt-3 leading-[1.6] opacity-85">
        Las zonas no son geografía oficial: agrupamos comunas enteras, y la
        columna del medio es la mediana de los barrios de la zona —el valor que
        deja la mitad de los barrios por encima y la mitad por debajo—, no un
        promedio ponderado como el de la Ciudad. Calculado sobre los precios de
        publicación que IDECBA releva de Argenprop, datos hasta el{" "}
        {LAST_UPDATED}.
      </p>
    </figure>
  );
}

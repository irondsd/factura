import {
  DEFAULT_SIZE,
  display,
  formatM2,
  LAST_UPDATED,
  zonas,
} from "@/content/estadisticas/data/oferta-alquiler-caba";

// The city's rental offer in four rows: norte, centro, oeste and sur.
//
// The zones are ours — nobody publishes a boundary for "zona oeste", so this
// groups whole comunas in a way the reader can see and argue with (see `ZONAS`
// in data/caba.ts). But unlike `PrecioPorZona`, which has to spend a paragraph
// defending a median of barrios against IDECBA's listing-weighted average,
// **the arithmetic here needs no defence**: these are totals, so a zone's
// figure is exactly the sum of its barrios', which is the same sum the source
// would compute. Only the grouping is a judgement call.
//
// That is why the column that matters is the share. A supply page's real
// finding is not that one zone has more square metres than another — the zones
// are different sizes — but how lopsided the split is, and a percentage is the
// only way to say that in a number a reader can carry away.

export function OfertaPorZona() {
  const rows = zonas(DEFAULT_SIZE);

  return (
    <figure className="fd-card my-8 px-5 pt-5 pb-4">
      <figcaption className="mb-4">
        <h3 className="font-mono text-micro uppercase tracking-label-wide text-muted m-0 scroll-mt-24">
          Dónde se concentra la oferta de alquiler
        </h3>
        <p className="font-mono text-xs text-muted mt-1.5 opacity-85 leading-[1.6]">
          Departamentos publicados en alquiler · {LAST_UPDATED}
        </p>
      </figcaption>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="fd-th">Zona</th>
              <th className="fd-th text-right pl-3">En oferta</th>
              <th className="fd-th text-right pl-3">De la Ciudad</th>
              <th className="fd-th text-right pl-3">Barrio con más oferta</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((z) => (
              <tr key={z.id}>
                <td className="fd-td align-top">
                  <span className="text-ink">{z.label}</span>
                  <span className="block text-muted text-[11.5px] leading-[1.5] mt-0.5">
                    {z.comunas}
                  </span>
                </td>
                <td className="fd-td text-right pl-3 tabular-nums whitespace-nowrap text-ink align-top">
                  {display(z.units)}
                  <span className="block text-muted text-[11.5px] leading-[1.5] mt-0.5 font-normal">
                    {formatM2(z.m2)}
                  </span>
                </td>
                <td className="fd-td text-right pl-3 tabular-nums whitespace-nowrap text-ink/90 align-top">
                  {z.share.toLocaleString("es-AR", {
                    maximumFractionDigits: 0,
                  })}{" "}
                  %
                </td>
                <td className="fd-td text-right pl-3 align-top">
                  <span className="block text-ink/90">{z.top.label}</span>
                  <span className="block text-muted text-[11.5px] leading-[1.5] mt-0.5 tabular-nums">
                    {display(z.top.units)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="font-mono text-xs text-muted mt-4 leading-[1.6]">
        Cómo se reparte por zonas la oferta de departamentos en alquiler de la
        Ciudad de Buenos Aires: cuánto se publica en el norte, en el centro, en
        el oeste y en el sur, qué porcentaje del total representa cada zona y
        cuál es el barrio que más concentra dentro de cada una.
      </p>

      <p className="font-mono text-[11.5px] text-muted mt-3 leading-[1.6] opacity-85">
        Las zonas no son geografía oficial: agrupamos comunas enteras. La suma
        sí es exacta —son totales, y el total de una zona es la suma de sus
        barrios—, a diferencia de los promedios de las páginas de precios, que
        no se pueden sumar. La cantidad de departamentos es aproximada: son los
        metros cuadrados avisados divididos por la superficie promedio de un
        aviso del mes. Datos de IDECBA sobre la base de Argenprop, hasta{" "}
        {LAST_UPDATED}.
      </p>
    </figure>
  );
}

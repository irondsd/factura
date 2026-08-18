import {
  formatUsd,
  LAST_UPDATED,
  REFERENCE_AREA,
  SOURCE,
  totalPrice,
  UNITS,
  unidadMedia,
  zonas,
} from "@/content/estadisticas/data/venta-pba";

// "¿Y cuánto sale entonces un departamento?" — the same question the CABA page
// answers with `PrecioDepartamento`, and the same arithmetic, but cut by zone
// rather than given once for the whole territory.
//
// Once, here, would be a lie. CABA's spread is wide but it is one city with one
// market; the province's dearest partido is nearly three times its cheapest,
// and a single "un dos ambientes en la provincia sale X" would describe
// nowhere. Three rows is the least that is honest.
//
// The surfaces are the source's own — Zonaprop's "unidad media" is 50 m² for
// two ambientes and 70 m² for three — so the multiplication on this page and
// the index it multiplies agree about what a two-ambiente flat is. Both columns
// that go into the total are on screen, so a reader looking at a 62 m² flat can
// redo the sum instead of trusting ours.

const AREA = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 });

export function PrecioDepartamentoPba() {
  const rows = zonas().map((z) => {
    const media = unidadMedia(z.id);
    return {
      ...z,
      units: UNITS.map((u) => {
        // The zone's typical unit price where the source publishes one for that
        // layout, and the middle partido otherwise. Named in the note: the two
        // are different measures and the table should not blur them.
        const perMetre = media[u.id] ?? z.median;
        return {
          ...u,
          perMetre,
          total:
            perMetre === null
              ? null
              : totalPrice(perMetre, REFERENCE_AREA[u.id]),
        };
      }),
    };
  });

  return (
    <figure className="fd-card my-8 px-5 pt-5 pb-4">
      <figcaption className="mb-4">
        <h3 className="font-mono text-micro uppercase tracking-label-wide text-muted m-0 scroll-mt-24">
          Cuánto cuesta un departamento en el Gran Buenos Aires
        </h3>
        <p className="font-mono text-xs text-muted mt-1.5 opacity-85 leading-[1.6]">
          Por zona, según la unidad media de cada una · {LAST_UPDATED}
        </p>
      </figcaption>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="fd-th">Zona</th>
              {UNITS.map((u) => (
                <th key={u.id} className="fd-th text-right pl-3">
                  {u.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((z) => (
              <tr key={z.id}>
                <td className="fd-td align-top">
                  <span className="text-ink whitespace-nowrap">{z.label}</span>
                </td>
                {z.units.map((u) => (
                  <td
                    key={u.id}
                    className="fd-td text-right pl-3 align-top tabular-nums whitespace-nowrap"
                  >
                    <span className="text-ink">
                      {u.total === null ? "—" : formatUsd(u.total)}
                    </span>
                    <span className="block text-muted text-[11.5px] leading-[1.5] mt-0.5">
                      {u.perMetre === null
                        ? "—"
                        : `${formatUsd(u.perMetre)}/m² · ${AREA.format(REFERENCE_AREA[u.id])} m²`}
                    </span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="font-mono text-xs text-muted mt-4 leading-[1.6]">
        Para un partido en particular la cuenta es la misma: el valor del m² que
        figura en el mapa, multiplicado por los metros cubiertos de la unidad.
        Los precios por metro de dos y de tres ambientes no van juntos —en el
        norte el departamento más grande cuesta más por metro y en el oeste
        cuesta menos—, así que conviene usar el de la superficie que estás
        mirando.
      </p>

      <p className="font-mono text-[11.5px] text-muted mt-3 leading-[1.6] opacity-85">
        Las superficies son las que usa la fuente para su unidad media: 50 m²
        cubiertos para un dos ambientes y 70 m² para un tres ambientes. El total
        está redondeado al millar. Son precios de publicación en dólares, no de
        escrituración, y {SOURCE} los calcula sobre los avisos de su propio
        portal. Datos hasta {LAST_UPDATED}.
      </p>
    </figure>
  );
}

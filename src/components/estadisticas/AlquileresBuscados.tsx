import {
  barrio,
  DEFAULT_SIZE,
  formatArs,
  formatArsPerMetre,
  LAST_UPDATED,
  NO_DATA,
  REFERENCE_AREA,
  SIZES,
} from "@/content/estadisticas/data/alquiler-caba";

// The rent counterpart of `BarriosBuscados`: the handful of barrios people type
// into a search box, pulled out of the 48-row table so they can be read without
// hunting, each with its position among the barrios that have a figure.
//
// Same list as the sale page on purpose — these are the barrios that get looked
// up, and keeping them identical is what lets a reader carry a comparison
// between the two pages.
//
// The third column is the rent per m², which on this page is doing real work
// rather than decorating: it is the only figure here that compares across unit
// sizes, and it is IDECBA's own arithmetic (their monthly figure assumes a
// fixed surface, stated in the source and read out by the refresh script), not
// a reference number we picked. That is the difference from the sale page's
// third column, which *is* ours and has to say so.

const FEATURED = [
  "palermo",
  "belgrano",
  "recoleta",
  "villa-urquiza",
  "caballito",
  "flores",
] as const;

const SIZE = SIZES.find((s) => s.id === DEFAULT_SIZE)!;
const AREA = REFERENCE_AREA[DEFAULT_SIZE];

/** "A, B y C" — Spanish has no serial comma. */
const list = (items: string[]): string =>
  items.length < 2
    ? (items[0] ?? "")
    : `${items.slice(0, -1).join(", ")} y ${items[items.length - 1]}`;

export function AlquileresBuscados() {
  // Dearest first, so the "puesto" column reads in order. Withheld barrios have
  // no rank and go last — on this page that is a real possibility, not a
  // formality: IDECBA withholds rent for about a third of the barrios.
  const rows = FEATURED.map((id) => ({
    id,
    data: barrio(id, DEFAULT_SIZE),
  })).sort((a, b) => (b.data?.monthly ?? -1) - (a.data?.monthly ?? -1));

  return (
    <figure className="fd-card my-8 px-5 pt-5 pb-4">
      <figcaption className="mb-4">
        <h3 className="font-mono text-micro uppercase tracking-label-wide text-muted m-0 scroll-mt-24">
          El alquiler en los barrios más consultados
        </h3>
        <p className="font-mono text-xs text-muted mt-1.5 opacity-85 leading-[1.6]">
          Departamentos usados de {SIZE.label} · {LAST_UPDATED}
        </p>
      </figcaption>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="fd-th">Barrio</th>
              <th className="fd-th text-right pl-3">Alquiler por mes</th>
              <th className="fd-th text-right pl-3">Por m²</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ id, data }) => (
              <tr key={id}>
                <td className="fd-td align-top">
                  <span className="text-ink">{data?.label ?? id}</span>
                  <span className="block text-muted text-[11.5px] leading-[1.5] mt-0.5">
                    {data
                      ? `${data.meta} · ${data.rank}.º de ${data.of}`
                      : NO_DATA}
                  </span>
                </td>
                <td className="fd-td text-right pl-3 align-top tabular-nums whitespace-nowrap text-ink">
                  {data ? formatArs(data.monthly) : "—"}
                </td>
                <td className="fd-td text-right pl-3 align-top tabular-nums whitespace-nowrap text-ink/90">
                  {data ? formatArsPerMetre(data.perMetre) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="font-mono text-xs text-muted mt-4 leading-[1.6]">
        Cuánto sale alquilar en{" "}
        {list(rows.map((r) => r.data?.label ?? r.id))}, con el precio del mes y
        el equivalente por metro cuadrado. El resto de los barrios de la Ciudad
        están en la tabla completa, debajo del mapa.
      </p>

      <p className="font-mono text-[11.5px] text-muted mt-3 leading-[1.6] opacity-85">
        El puesto es entre los barrios con alquiler publicado este trimestre, del
        más caro al más barato; cuántos son cambia según cuántos avisos haya
        habido, y en alquiler son bastantes menos que en venta. El valor por m²
        es el precio del mes dividido por los {AREA} m² que IDECBA toma como
        superficie de referencia para un {SIZE.label}. Fuente: IDECBA sobre la
        base de Argenprop, datos hasta el {LAST_UPDATED}.
      </p>
    </figure>
  );
}

import {
  barrio,
  DEFAULT_SIZE,
  formatPayback,
  formatUsd,
  formatYield,
  LAST_UPDATED,
  NO_DATA,
  REFERENCE_AREA,
  SIZES,
} from "@/content/estadisticas/data/rentabilidad-caba";

// The handful of barrios people actually type into a search box, pulled out of
// the 48-row table under the map.
//
// The same six as the sale and rent pages, so a reader can carry a comparison
// across all three — and here the list does something the other two can't. On
// the price pages these six run in a fairly narrow band. Ranked by return they
// come apart: the two at the top and the two at the bottom are the two ends of
// the whole city, and the ordering is close to the reverse of the one the
// sibling pages show. That reversal is the page's argument in six rows.

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

export function RentabilidadBuscados() {
  // Most profitable first, so the "puesto" column reads in order. Withheld
  // barrios have no rank and sort last.
  const rows = FEATURED.map((id) => ({
    id,
    data: barrio(id, DEFAULT_SIZE),
  })).sort((a, b) => (b.data?.value ?? -1) - (a.data?.value ?? -1));

  return (
    <figure className="fd-card my-8 px-5 pt-5 pb-4">
      <figcaption className="mb-4">
        <h3 className="font-mono text-micro uppercase tracking-label-wide text-muted m-0 scroll-mt-24">
          Qué rinde en los barrios más consultados
        </h3>
        <p className="font-mono text-xs text-muted mt-1.5 opacity-85 leading-[1.6]">
          Departamentos usados de {SIZE.label} de {AREA} m² · {LAST_UPDATED}
        </p>
      </figcaption>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="fd-th">Barrio</th>
              <th className="fd-th text-right pl-3">Rentabilidad</th>
              <th className="fd-th text-right pl-3">Repago</th>
              <th className="fd-th text-right pl-3">Precio del depto.</th>
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
                  {data ? formatYield(data.value) : "—"}
                </td>
                <td className="fd-td text-right pl-3 align-top tabular-nums whitespace-nowrap text-ink/90">
                  {data ? formatPayback(data.payback) : "—"}
                </td>
                <td className="fd-td text-right pl-3 align-top tabular-nums whitespace-nowrap text-ink/90">
                  {data?.flatUsd ? formatUsd(data.flatUsd) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="font-mono text-xs text-muted mt-4 leading-[1.6]">
        Cuánto rinde comprar para alquilar en cada uno de estos barrios y en
        cuántos años de alquiler se recupera la compra. El resto de la Ciudad
        está en la tabla completa, debajo del mapa.
      </p>

      <p className="font-mono text-[11.5px] text-muted mt-3 leading-[1.6] opacity-85">
        El puesto es entre los barrios que tienen los dos precios publicados
        este trimestre, del que más rinde al que menos —{" "}
        <strong className="font-medium">al revés</strong> que en las páginas de
        precio, donde el primer puesto es el más caro. El precio del
        departamento es el metro cuadrado publicado por los {AREA} m² que IDECBA
        toma como superficie de referencia para un {SIZE.label}; es el
        denominador de la cuenta, no un aviso concreto. Rentabilidad bruta,
        antes de expensas, ABL, impuestos y meses vacíos. Fuentes: IDECBA sobre
        la base de Argenprop y ArgentinaDatos, datos hasta el {LAST_UPDATED}.
      </p>
    </figure>
  );
}

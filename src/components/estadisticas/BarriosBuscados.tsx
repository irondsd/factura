import {
  barrio,
  DEFAULT_SIZE,
  formatUsd,
  LAST_UPDATED,
  NO_DATA,
  REFERENCE_AREA,
  SIZES,
  totalPrice,
} from "@/content/estadisticas/data/venta-caba";

// The handful of barrios people actually type into a search box, pulled out of
// the 48-row table so they can be read without hunting.
//
// The table under the map already has every barrio, sorted by price. What it
// can't give is *position*: that Palermo is the third dearest of the city and
// Flores the thirty-somethingth is the fact that makes a number mean something,
// and it is not readable from a list you have to count down. So each row here
// carries its rank, and both the rank and the count it is out of are derived —
// the count moves every quarter, because it counts only the barrios IDECBA
// published a figure for.
//
// Editorial, and deliberately short: a row per barrio for all 48 would be the
// table above with extra columns.

/** The barrios this section covers, by `caba.ts` id. Chosen for how often they
 * are looked up, not for what they cost — a list that quietly turned into "the
 * six dearest" would be a different page. */
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

export function BarriosBuscados() {
  // Dearest first, like every other table on the page — listing them in the
  // editorial order above would print the "puesto" column out of order, which
  // reads as a bug in the ranking rather than as a choice about the list.
  // Withheld barrios have no rank, so they go last.
  const rows = FEATURED.map((id) => ({
    id,
    data: barrio(id, DEFAULT_SIZE),
  })).sort((a, b) => (b.data?.value ?? -1) - (a.data?.value ?? -1));

  return (
    <figure className="fd-card my-8 px-5 pt-5 pb-4">
      <figcaption className="mb-4">
        <h3 className="font-mono text-micro uppercase tracking-label-wide text-muted m-0 scroll-mt-24">
          El valor del m² en los barrios más consultados
        </h3>
        <p className="font-mono text-xs text-muted mt-1.5 opacity-85 leading-[1.6]">
          Departamentos usados de {SIZE.inTitle} · {LAST_UPDATED}
        </p>
      </figcaption>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          {/* The rank rides in the barrio cell's second line rather than in a
              fourth column, for the reason given in PrecioDepartamento: two
              money columns are all a narrow phone has room for beside a name,
              and the rank is the one value here that isn't a price. */}
          <thead>
            <tr>
              <th className="fd-th">Barrio</th>
              <th className="fd-th text-right pl-3">US$ por m²</th>
              <th className="fd-th text-right pl-3">
                Un {SIZE.short} de {AREA} m²
              </th>
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
                  {data ? formatUsd(data.value) : "—"}
                </td>
                <td className="fd-td text-right pl-3 align-top tabular-nums whitespace-nowrap text-ink/90">
                  {data ? formatUsd(totalPrice(data.value, AREA)) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="font-mono text-xs text-muted mt-4 leading-[1.6]">
        {/* The list is built from the rows so it can't fall out of step with
            them, and joined with a final "y" so it reads as a sentence. */}
        El valor del metro cuadrado en{" "}
        {list(rows.map((r) => r.data?.label ?? r.id))}, con el precio de un
        departamento de {SIZE.inTitle} de {AREA} m² en cada uno. El resto de los
        barrios de la Ciudad están en la tabla completa, debajo del mapa.
      </p>

      <p className="font-mono text-[11.5px] text-muted mt-3 leading-[1.6] opacity-85">
        El puesto es entre los barrios con precio publicado este trimestre, del
        más caro al más barato; cuántos son cambia según cuántos avisos haya
        habido. Los {AREA} m² son una superficie de referencia, no un promedio
        del mercado. Fuente: IDECBA sobre la base de Argenprop, datos hasta el{" "}
        {LAST_UPDATED}.
      </p>
    </figure>
  );
}

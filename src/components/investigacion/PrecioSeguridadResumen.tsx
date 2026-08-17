import {
  CATEGORIES,
  ciudad,
  CRIME_YEAR,
  DEFAULT_CATEGORY,
  DEFAULT_SIZE,
  formatArsPerMetre,
  formatRate,
  ranked,
  RENT_PERIOD_LABEL,
  SIZES,
} from "@/content/investigacion/data/alquiler-seguridad";

// The two quantities the page joins, side by side, before any of the arithmetic
// that joins them.
//
// It exists to make one thing visible that decides the whole method: the two
// axes are shaped nothing alike. Rent per m² spans a little over a third
// between the cheapest barrio and the dearest; recorded crime spans several
// times over. Any scheme that normalises the two levels against their own
// ranges would let the crime tail swallow the comparison and hand back the rent
// ranking with extra steps — which is why everything below this figure works in
// ranks. The reader is shown the reason rather than told it.
//
// The extremes are the barrios that can actually be scored, not all 48: those
// are the ones the rest of the page compares, and quoting a spread over a wider
// set than the analysis uses would overstate its own range.

const SIZE = SIZES.find((s) => s.id === DEFAULT_SIZE)!;
const CATEGORY = CATEGORIES.find((c) => c.id === DEFAULT_CATEGORY)!;

const times = (value: number): string =>
  `${value.toFixed(1).replace(".", ",")}×`;

export function PrecioSeguridadResumen() {
  const order = ranked("barrios");
  const city = ciudad();

  const rents = order.map((r) => r.rentPerMetre);
  const crimes = order.map((r) => r.crimeRate);
  const cheapest = order.reduce((a, b) =>
    b.rentPerMetre < a.rentPerMetre ? b : a,
  );
  const dearest = order.reduce((a, b) =>
    b.rentPerMetre > a.rentPerMetre ? b : a,
  );
  const calmest = order.reduce((a, b) => (b.crimeRate < a.crimeRate ? b : a));
  const worst = order.reduce((a, b) => (b.crimeRate > a.crimeRate ? b : a));

  const rows = [
    {
      key: "alquiler",
      measure: `Alquiler pedido, ${SIZE.short}`,
      unit: "$/m² por mes",
      city: city.rentPerMetre === null ? "—" : formatArsPerMetre(city.rentPerMetre), // prettier-ignore
      low: { label: cheapest.label, value: formatArsPerMetre(cheapest.rentPerMetre) }, // prettier-ignore
      high: { label: dearest.label, value: formatArsPerMetre(dearest.rentPerMetre) }, // prettier-ignore
      spread: Math.max(...rents) / Math.min(...rents),
    },
    {
      key: "delitos",
      measure: `${CATEGORY.label} registrados`,
      unit: "cada 1.000 hab. por año",
      city: formatRate(city.crimeRate),
      low: { label: calmest.label, value: formatRate(calmest.crimeRate) },
      high: { label: worst.label, value: formatRate(worst.crimeRate) },
      spread: Math.max(...crimes) / Math.min(...crimes),
    },
  ];

  return (
    <figure className="fd-card my-8 px-5 pt-5 pb-4">
      <figcaption className="mb-4">
        <h3 className="font-mono text-micro uppercase tracking-label-wide text-muted m-0 scroll-mt-24">
          Las dos variables, y por qué no se pueden sumar
        </h3>
        <p className="font-mono text-xs text-muted mt-1.5 opacity-85 leading-[1.6]">
          Sobre los {order.length} barrios con alquiler publicado · alquiler del{" "}
          {RENT_PERIOD_LABEL}, delitos de {CRIME_YEAR}
        </p>
      </figcaption>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="fd-th">Medida</th>
              <th className="fd-th text-right pl-3">Ciudad</th>
              <th className="fd-th text-right pl-3">Mínimo</th>
              <th className="fd-th text-right pl-3">Máximo</th>
              <th className="fd-th text-right pl-3">Veces</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                <td className="fd-td">
                  <span className="text-ink">{r.measure}</span>
                  <span className="text-muted"> · {r.unit}</span>
                </td>
                <td className="fd-td text-right pl-3 text-ink tabular-nums whitespace-nowrap">
                  {r.city}
                </td>
                {[r.low, r.high].map((end) => (
                  <td
                    key={end.label}
                    className="fd-td text-right pl-3 text-ink/90 tabular-nums whitespace-nowrap"
                  >
                    {end.value}
                    <span className="block text-muted">{end.label}</span>
                  </td>
                ))}
                <td className="fd-td text-right pl-3 text-muted tabular-nums whitespace-nowrap">
                  {times(r.spread)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="font-mono text-xs text-muted mt-4 leading-[1.6]">
        La última columna es todo el problema. Entre el barrio más barato y el
        más caro hay una diferencia moderada; entre el más tranquilo y el que
        más hechos registra, mucho mayor. Escalar las dos medidas contra su
        propio rango dejaría a casi todos los barrios amontonados en el extremo
        seguro y el «puntaje combinado» sería, en los hechos, el ranking de
        precios otra vez. Por eso lo que se combina son posiciones, no valores.
      </p>

      <p className="font-mono text-[11.5px] text-muted mt-3 leading-[1.6] opacity-85">
        La fila del alquiler es el precio pedido en avisos, no el firmado, y la
        de delitos son hechos{" "}
        <strong className="font-medium">registrados</strong>, no ocurridos. La
        cifra de la Ciudad en alquiler es el total ponderado que publica el
        organismo, y la de delitos incluye los hechos que no se pudieron ubicar
        en ningún barrio, así que ninguna de las dos es el promedio de las
        columnas de al lado.
      </p>
    </figure>
  );
}

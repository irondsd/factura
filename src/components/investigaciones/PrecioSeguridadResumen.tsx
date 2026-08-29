import { DataFigure } from "@/components/figures/DataFigure";
import { DataTable } from "@/components/figures/DataTable";
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
} from "@/content/investigaciones/data/alquiler-seguridad";

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
    <DataFigure
      header={{
        title: <>Las dos variables, y por qué no se pueden sumar</>,
        subtitle: (
          <>
            Sobre los {order.length} barrios con alquiler publicado · alquiler
            del {RENT_PERIOD_LABEL}, delitos de {CRIME_YEAR}
          </>
        ),
      }}
      caption={
        <>
          La última columna es todo el problema. Entre el barrio más barato y el
          más caro hay una diferencia moderada; entre el más tranquilo y el que
          más hechos registra, mucho mayor. Escalar las dos medidas contra su
          propio rango dejaría a casi todos los barrios amontonados en el
          extremo seguro y el «puntaje combinado» sería, en los hechos, el
          ranking de precios otra vez. Por eso lo que se combina son posiciones,
          no valores.
        </>
      }
      note={
        <>
          La fila del alquiler es el precio pedido en avisos, no el firmado, y
          la de delitos son hechos{" "}
          <strong className="font-medium">registrados</strong>, no ocurridos. La
          cifra de la Ciudad en alquiler es el total ponderado que publica el
          organismo, y la de delitos incluye los hechos que no se pudieron
          ubicar en ningún barrio, así que ninguna de las dos es el promedio de
          las columnas de al lado.
        </>
      }
    >
      <div className="overflow-x-auto">
        <DataTable
          rows={rows}
          rowKey={(r) => r.key}
          columns={[
            {
              header: "Medida",
              cell: (r) => (
                <>
                  <span className="text-ink">{r.measure}</span>
                  <span className="text-muted"> · {r.unit}</span>
                </>
              ),
            },
            {
              header: "Ciudad",
              headClassName: "pl-3",
              numeric: true,
              cellClassName: "pl-3 text-ink",
              cell: (r) => r.city,
            },
            // The two ends read the same way, so they are the same column twice
            // over a different field rather than two hand-written ones.
            ...(["low", "high"] as const).map((end, i) => ({
              header: i === 0 ? "Mínimo" : "Máximo",
              headClassName: "text-right pl-3",
              numeric: true,
              cellClassName: "pl-3 text-ink/90",
              cell: (r: (typeof rows)[number]) => (
                <>
                  {r[end].value}
                  <span className="block text-muted">{r[end].label}</span>
                </>
              ),
            })),
            {
              header: "Veces",
              headClassName: "pl-3",
              numeric: true,
              cellClassName: "pl-3 text-muted",
              cell: (r) => times(r.spread),
            },
          ]}
        />
      </div>
    </DataFigure>
  );
}

import { DataFigure } from "@/components/figures/DataFigure";
import { MapaCaba, type MapView } from "@/components/maps/MapaCaba";
import {
  barrioLabel,
  type BarrioId,
  CG_MAX,
  CG_MIN,
  comunaOf,
  formatCoef,
  formatPesos,
  formatRango,
  LEY,
  rango,
  SOURCE,
  tasaEfectiva,
} from "@/content/estadisticas/data/abl-caba";
import { BARRIOS } from "@/content/shared/caba";

// The map on /estadisticas/coeficiente-abl-por-barrio-caba: the coeficiente
// geográfico the Ley Impositiva gives each barrio, the factor that makes the
// same VFH pay a different tasa in Puerto Madero and in Villa Soldati.
//
// The server half of the figure, in the same split as the other CABA maps (see
// VentaCabaMapa.tsx): it turns the art. 42 table into plain views and every
// string the interactive half prints.
//
// ── Why the switch is "más alta / más baja" ───────────────────────────────
// The law sets the coefficient by subzona, and 19 barrios have more than one.
// A barrio has to be one colour on a choropleth, so the map has to pick: the
// dearest subzona, or the cheapest. Neither is "the barrio's" coefficient —
// Palermo runs from 1,25 south of Santa Fe to 2,00 around the Hipódromo — and
// a midpoint would be a number no property in the barrio pays. So the reader
// picks, the table prints the whole range whichever they pick, and the full
// subzona table sits beside the map on the page.
//
// ── Why the second column is pesos ────────────────────────────────────────
// A coefficient of 1,25 means nothing until it is money. The `sub` column is
// the tasa one million pesos of VFH owes in a year at that coefficient,
// `1.000.000 × ab × (1 + CG × pCG)`, before the surcharge — which is the same
// ordering as the coefficient, so the colour never disagrees with it, and it
// scales by eye to any VFH.
//
// No comuna view: comunas are not a unit the law uses, and averaging
// coefficients across barrios would make up a number nobody is charged.

type Extremo = "max" | "min";

const EXTREMOS: { id: Extremo; label: string; noun: string }[] = [
  { id: "max", label: "Subzona más alta", noun: "más alta" },
  { id: "min", label: "Subzona más baja", noun: "más baja" },
];

/** Upper bounds of the six classes. The law's coefficients are quarter steps
 * from 0 to 2, nine values; the classes group them so the three zones read as
 * three families of colour. */
const BREAKS = [0.25, 0.75, 1, 1.5, 1.75];
const LEGEND = [
  { label: "0,00" },
  { label: "0,25–0,50" },
  { label: "0,75" },
  { label: "1,00–1,25" },
  { label: "1,50" },
  { label: "1,75–2,00" },
];

const MILLON = 1_000_000;

function view(extremo: Extremo): MapView {
  const regions = BARRIOS.map((b) => {
    const id = b.id as BarrioId;
    const r = rango(id);
    const cg = extremo === "max" ? r.max : r.min;
    return {
      id,
      label: barrioLabel(id),
      meta: `Comuna ${comunaOf(id)} · Zona ${r.zonas.join(" y ")}`,
      value: cg,
      display: formatRango(r.min, r.max),
      sub: formatPesos(MILLON * tasaEfectiva(cg)),
    };
  });

  const sorted = [...regions].sort((a, b) => b.value - a.value);
  const top = sorted.filter((r) => r.value === sorted[0].value);
  const bottom = sorted.filter((r) => r.value === sorted.at(-1)!.value);
  const names = (rs: typeof regions) =>
    rs.length > 3 ? `${rs.length} barrios` : rs.map((r) => r.label).join(", ");

  const split = BARRIOS.filter((b) => rango(b.id as BarrioId).subzonas > 1);
  const { noun } = EXTREMOS.find((e) => e.id === extremo)!;

  return {
    geo: "barrios",
    regions,
    stat: [
      `Coeficiente de ${formatCoef(CG_MIN)} a ${formatCoef(CG_MAX)}`,
      `Más alto: ${names(top)} (${formatCoef(top[0].value)})`,
      `Más bajo: ${names(bottom)} (${formatCoef(bottom[0].value)})`,
    ].join(" · "),
    note:
      `Los ${BARRIOS.length} barrios tienen coeficiente. ${split.length} están divididos en subzonas por avenidas; ` +
      `en esos el color es el de la subzona ${noun} y la columna del coeficiente muestra el rango completo. ` +
      `La última columna es la tasa ABL anual por fórmula para $ 1 millón de VFH con ese coeficiente, antes del tope de aumento, los beneficios y el adicional del 1 %.`,
  };
}

export function AblCoeficienteMapa() {
  const views: Record<string, MapView> = {
    max: view("max"),
    min: view("min"),
  };

  return (
    <DataFigure
      caption={
        <>
          Coeficiente geográfico de la tasa ABL por barrio de la Ciudad de
          Buenos Aires en {LEY.year}, según la Ley Impositiva. Permite comparar
          el coeficiente de Palermo, Belgrano, Recoleta, Caballito, Villa
          Urquiza, Flores o Villa Lugano y ver cuánto cambia la tasa entre la
          zona sur, el centro y el corredor norte.
        </>
      }
      note={
        <>
          El coeficiente multiplica solo la tasa ABL, no el Impuesto
          Inmobiliario, que depende únicamente de la valuación fiscal. Los
          límites entre subzonas son avenidas y calles que la ley enumera sin
          mapa; el trazado de los barrios es el oficial de la Ciudad. Fuente:{" "}
          {SOURCE}.
        </>
      }
    >
      <MapaCaba
        title={`Coeficiente geográfico del ABL por barrio, CABA ${LEY.year}`}
        dimensions={[
          {
            name: "extremo",
            label: "Subzona que se muestra",
            options: EXTREMOS.map((e) => ({ value: e.id, label: e.label })),
          },
        ]}
        initial={{ extremo: "max" }}
        views={views}
        breaks={BREAKS}
        legend={LEGEND}
        noDataLabel="Sin coeficiente"
        dataDate={`Ley ${LEY.number} · vigente desde el 1 de enero de ${LEY.year}`}
        columns={{
          region: "Barrio",
          value: "Coeficiente",
          sub: "Tasa por $ 1 M",
        }}
        ariaLabel="Mapa de la Ciudad de Buenos Aires sombreado según el coeficiente geográfico de la tasa ABL de cada barrio. Los mismos valores están en la tabla que sigue."
      />
    </DataFigure>
  );
}

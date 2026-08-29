import { DataFigure } from "@/components/figures/DataFigure";
import { MapaProvincia, type MapView } from "@/components/maps/MapaProvincia";
import {
  all,
  BREAKS,
  COVERAGE,
  coverage,
  display,
  extremes,
  formatUsd,
  LEGEND,
  METHOD,
  NO_DATA,
  PROVINCIAL,
  SOURCE,
  VINTAGE,
} from "@/content/estadisticas/data/suelo-pba";

// The map on /estadisticas/precio-m2-terreno-provincia-buenos-aires: the median
// asking price per square metre of land, by partido, across the whole province.
//
// Server half of the figure, in the same split as every other map here — it
// owns the shell, the caption and every formatted string, and hands
// `MapaProvincia` plain views to draw.
//
// ── Why this map is worth drawing and the table under it is not enough ────
// 135 rows sorted by price is a list of partidos, and nobody knows where
// Tapalqué is. Shaded, three things show up at once, and all three are about
// *where* rather than about rank: the dark metropolitan blot stops well short
// of the conurbano's outer edge; the Atlantic coast between La Costa and Mar
// del Plata is a strip of its own, above the farming partidos immediately
// behind it; and outside the metropolitan area only Pinamar and Ensenada clear
// USD 100. A ranking can state none of the three.
//
// ── The two kinds of blank, which are not the same blank ──────────────────
// 61 of the 135 partidos are striped, for two different reasons: 20 the
// relevamiento never visited, and 41 it visited too thinly to publish a median
// for. The map cannot draw the difference — both are hatched — so the note
// states it and the table's second column carries the sample count, which is
// where a reader can tell "nobody looked" from "eight parcels".

/** The table's second line for a partido, and the tooltip's. It is the only
 * place a reader can tell the two kinds of blank apart. */
const samples = (n: number): string =>
  n === 0 ? "sin muestras" : n === 1 ? "1 muestra" : `${n} muestras`;

/** The line under the heading. Derived: a refresh that widens the relevamiento
 * can move either end of the range. */
function stat(): string {
  const { top, bottom, ratio } = extremes();
  const RATIO = new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
  return [
    `Mediana provincial ${formatUsd(PROVINCIAL)}/m²`,
    `máximo ${top.label} ${formatUsd(top.usdM2 as number)}`,
    `mínimo ${bottom.label} ${formatUsd(bottom.usdM2 as number)}`,
    `${RATIO.format(ratio)} veces entre puntas`,
  ].join(" · ");
}

function note(): string {
  const { withFigure, thin, absent, total } = coverage();
  return `${withFigure} de los ${total} partidos tienen mediana publicada y están coloreados. Los otros ${thin + absent} aparecen rayados por dos motivos distintos: en ${absent} el relevamiento no tomó ninguna muestra, y en ${thin} tomó menos de ${METHOD.minSamples}, que es el mínimo para publicar una mediana. La columna de muestras de la tabla dice cuál es cuál. Rayado significa que no hay dato suficiente, nunca que la tierra no valga nada.`;
}

export function SueloPbaMapa() {
  const view: MapView = {
    geo: "partidos",
    regions: all().map((r) => ({
      id: r.id,
      label: r.label,
      meta: samples(r.n),
      value: r.usdM2,
      display: display(r.usdM2),
      sub:
        r.usdM2 === null ? null : `${formatUsd(r.p25)} – ${formatUsd(r.p75)}`,
    })),
    stat: stat(),
    note: note(),
  };

  return (
    <DataFigure
      caption={
        <>
          La mediana de lo que se pide por un metro cuadrado de{" "}
          <strong className="text-ink font-normal">terreno</strong> —el suelo,
          sin nada construido encima— en cada partido. El mapa tiene tres cosas
          que la tabla no puede mostrar. La mancha oscura del conurbano no llega
          hasta su propio borde: se apaga antes, y Pilar, Moreno, Merlo o La
          Plata están al nivel de una ciudad del interior. La costa atlántica
          dibuja una franja propia entre La Costa y Mar del Plata, por encima de
          los partidos de campo que tiene detrás. Y el resto del territorio es
          casi todo un mismo tono: fuera del área metropolitana, solo Pinamar y
          Ensenada pasan los 100 dólares por metro. El «rango habitual» de la
          tabla va del percentil 25 al 75 de las muestras del partido, y es la
          mejor forma de ver cuánto se dispersa cada uno.
        </>
      }
      note={
        <>
          Son precios de oferta —lo que se pide, no lo que se escritura— de{" "}
          {COVERAGE.samplesTotal.toLocaleString("es-AR")} parcelas
          georreferenciadas relevadas entre {VINTAGE}. No es una serie: cada
          parcela se observó una sola vez y el relevamiento no se actualizó
          desde entonces, así que el mapa es una foto de esos años. Se publica
          la mediana, no el promedio, y se descartaron los lotes de más de{" "}
          {METHOD.maxSupM2.toLocaleString("es-AR")} m², que son campos y no
          terrenos para construir. Fuente: {SOURCE}.
        </>
      }
    >
      <MapaProvincia
        title="Precio del m² de terreno por partido, Provincia de Buenos Aires"
        dimensions={[]}
        initial={{}}
        views={{ "": view }}
        breaks={[...BREAKS]}
        legend={LEGEND}
        noDataLabel={NO_DATA}
        dataDate={`Relevamiento de ${VINTAGE} · no es una serie mensual`}
        columns={{
          region: "Partido",
          value: "US$ por m² de terreno",
          sub: "Rango habitual",
        }}
        ariaLabel="Mapa de los 135 partidos de la Provincia de Buenos Aires sombreados según el precio mediano de oferta del metro cuadrado de terreno. Los partidos sin dato suficiente aparecen rayados. Los mismos valores están en la tabla que sigue."
      />
    </DataFigure>
  );
}

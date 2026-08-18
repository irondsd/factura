import {
  type SerieRow,
  VentaPbaSerie,
  type ZonaOption,
} from "@/components/estadisticas/VentaPbaChartBody";
import {
  formatPct,
  formatUsd,
  LAST_PERIOD,
  PERIODS,
  periodLabel,
  periodShort,
  SCOPE,
  SOURCE,
  value,
} from "@/content/estadisticas/data/venta-pba";
import { partidosOfZona, ZONAS } from "@/content/shared/pba";

// The history figure: the same partidos as the map, read down their time axis
// instead of across the geography.
//
// ── What this figure is honest about ──────────────────────────────────────
// Ten months. Not because the market is ten months old but because the source
// deletes its own back issues after about eleven, so the series begins where
// Factura started keeping them rather than where Zonaprop's index does. It will
// be a year long in two months and five years long in five years. The caption
// says so, because a reader who has just been shown a decade of CABA history on
// the neighbouring page will otherwise read the short axis as a short market.
//
// ── Why partidos and not the zone index ───────────────────────────────────
// Zonaprop publishes a per-zone index that does go back to 2017, and it is
// tempting. It cannot be drawn: the zone reports were restructured in 2026-02
// and "GBA Oeste" means something different on either side of that date — see
// `ZONA_SERIES_BREAK` in the data module. A per-partido line has no such break,
// so this figure is built from the one thing that means the same throughout.

/** Everything derived, nothing typed: the ranking flips between refreshes. */
export function VentaPbaHistoria() {
  const rows: SerieRow[] = PERIODS.map((period) => {
    const row: SerieRow = { period, label: periodShort(period) };
    for (const z of ZONAS) {
      for (const p of partidosOfZona(z.id)) {
        row[p.id] = value(p.id, "usd", period);
      }
    }
    return row;
  });

  const zonas: ZonaOption[] = ZONAS.map((z) => ({
    id: z.id,
    label: z.label,
    // Every partido of the zone, dearest first — which is also the order the
    // opacity ramp in the plot runs in, so the legend and the lines agree.
    partidos: partidosOfZona(z.id)
      .map((p) => ({
        id: p.id,
        label: p.label,
        usd: value(p.id, "usd"),
        anual: value(p.id, "anual"),
      }))
      .filter((p) => p.usd !== null)
      .sort((a, b) => (b.usd as number) - (a.usd as number))
      .map((p) => ({
        id: p.id,
        label: p.label,
        stat: `${formatUsd(p.usd as number)}${p.anual === null ? "" : ` · ${formatPct(p.anual)} anual`}`,
      })),
  }));

  return (
    <figure className="fd-card my-8 px-5 pt-5 pb-4">
      <VentaPbaSerie
        rows={rows}
        zonas={zonas}
        initial="norte"
        unit="US$ por m², precio de publicación"
      />

      <figcaption className="font-mono text-xs text-muted mt-4 leading-[1.6]">
        El precio del metro cuadrado de cada partido de {SCOPE}, mes a mes, en
        dólares. En dólares y no en pesos porque así se opera y así se publica:
        una serie en dólares se puede leer de punta a punta sin corregir por
        inflación, cosa que con precios en pesos argentinos no se puede hacer.
        Los cortes en las líneas son meses sin dato, no meses sin mercado.
      </figcaption>

      <p className="font-mono text-[11.5px] text-muted mt-3 leading-[1.6] opacity-85">
        La serie arranca en {periodLabel(PERIODS[0])} y llega hasta{" "}
        {periodLabel(LAST_PERIOD)}. Es corta por una razón que conviene decir:{" "}
        {SOURCE} publica un informe por mes y da de baja los anteriores al cabo
        de unos once meses, así que esta serie empieza cuando Factura empezó a
        guardarlos y se alarga un mes por mes. La variación anual de cada
        partido sí mira doce meses atrás, porque la publica la fuente.
      </p>
    </figure>
  );
}

import {
  COVERAGE,
  formatUsd,
  interior,
  METHOD,
  PROVINCIAL,
  SOURCE,
  VINTAGE,
} from "@/content/estadisticas/data/suelo-pba";

// The province outside the Gran Buenos Aires, which the page's own series
// cannot reach.
//
// ── Why a different measure is better than none ───────────────────────────
// No portal publishes a price per m² for Tandil, Bahía Blanca or Mar del Plata,
// and no agency publishes one either. What does exist is the province's own
// land survey — the Observatorio de Valores de Suelo — which covers 115
// partidos. It measures **terreno**, not built space, which makes it a
// different question rather than the same question further away.
//
// That is a real limitation and the section is built around admitting it rather
// than around hiding it: the heading says "terreno", the unit column says
// "terreno", and the note says in as many words that these figures cannot be
// compared with the ones above. The alternative — leaving the reader who lives
// in Tandil with nothing at all — is worse, and the alternative that would be
// worst is quietly putting land and apartment prices in one table.
//
// ── Why these twelve ──────────────────────────────────────────────────────
// `INTERIOR` in the data module is a fixed hand-picked list of the interior
// cities a reader would look for, not "the twelve with the most samples". The
// question this answers is "is my city here", and the answer has to survive a
// refresh. The module throws if one of them falls below the sample threshold.

export function SueloPbaInterior() {
  const rows = interior();

  return (
    <figure className="fd-card my-8 px-5 pt-5 pb-4">
      <figcaption className="mb-4">
        <h3 className="font-mono text-micro uppercase tracking-label-wide text-muted m-0 scroll-mt-24">
          El resto de la provincia: precio del m² de terreno
        </h3>
        <p className="font-mono text-xs text-muted mt-1.5 opacity-85 leading-[1.6]">
          Relevamiento oficial · {VINTAGE} · mediana provincial{" "}
          {formatUsd(PROVINCIAL)}/m²
        </p>
      </figcaption>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="fd-th">Partido</th>
              <th className="fd-th text-right pl-3">US$ por m² de terreno</th>
              <th className="fd-th text-right pl-3">Rango habitual</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="fd-td align-top">
                  <span className="text-ink">{r.label}</span>
                  <span className="block text-muted text-[11.5px] leading-[1.5] mt-0.5">
                    {r.n} muestras
                  </span>
                </td>
                <td className="fd-td text-right pl-3 align-top text-ink tabular-nums whitespace-nowrap">
                  {formatUsd(r.usdM2 as number)}
                </td>
                <td className="fd-td text-right pl-3 align-top text-muted tabular-nums whitespace-nowrap">
                  {formatUsd(r.p25)} – {formatUsd(r.p75)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="font-mono text-xs text-muted mt-4 leading-[1.6]">
        <strong className="text-ink font-normal">
          Esto no se compara con los números de arriba.
        </strong>{" "}
        Un metro cuadrado de terreno y un metro cuadrado de departamento
        construido son dos cosas distintas, y se llevan un orden de magnitud: el
        terreno es el suelo pelado, sin nada encima. Si leés esta tabla como si
        fuera la anterior vas a concluir que el interior es treinta veces más
        barato, y no lo es.
      </p>

      <p className="font-mono text-[11.5px] text-muted mt-3 leading-[1.6] opacity-85">
        Es el único dato oficial de precio por metro cuadrado que existe para
        toda la provincia: {COVERAGE.samplesTotal.toLocaleString("es-AR")}{" "}
        muestras georreferenciadas de terrenos en oferta, relevadas entre{" "}
        {VINTAGE} en {COVERAGE.partidosWithSamples} de los{" "}
        {COVERAGE.partidosTotal} partidos. No es una serie: cada parcela se
        observó una sola vez y el relevamiento no se actualizó desde entonces,
        así que estos valores son una foto de esos años y no del mes pasado. Se
        publica la mediana, no el promedio, y solo para los partidos con al
        menos {METHOD.minSamples} muestras; se descartaron los lotes de más de{" "}
        {METHOD.maxSupM2.toLocaleString("es-AR")} m², que son campos y no
        terrenos para construir. El «rango habitual» va del percentil 25 al 75.
        Fuente: {SOURCE}.
      </p>
    </figure>
  );
}

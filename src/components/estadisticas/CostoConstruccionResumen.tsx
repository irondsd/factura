import {
  costo,
  costoUsd,
  formatArs,
  formatPct,
  formatUsd,
  IS_PROVISIONAL,
  LAST_UPDATED,
  MODELS,
  yoy,
} from "@/content/estadisticas/data/costo-construccion-caba";

// The page's headline figure, and the literal answer to what people type into
// search: what one square metre of construction costs in CABA this month.
//
// A table rather than a chart, and first on the page for that reason. The
// question is a lookup, not a trend — someone asking "¿cuánto sale el m² de
// construcción?" wants a number they can multiply, and a chart makes them read
// one off an axis. The trend is the figure below this one.
//
// Ordinary server-rendered markup, so all five figures are in the HTML as text
// (AUTHORING.md §7) rather than waiting on a chart library to measure a box.
//
// ── Why the four models are here and not hidden behind a switch ────────────
// Because the spread *is* the answer. There is no single price of building a
// square metre: the same metre is about a quarter dearer in the suntuosa model
// than in the sencilla, and a page that showed one figure would be picking a
// number and calling it the truth. The city total leads because it is what the
// question means to someone who hasn't been told there are four; the rest is
// the range around it, in the source's own terms.

export function CostoConstruccionResumen() {
  const rows = MODELS.map((m) => ({
    ...m,
    ars: costo(m.id),
    usd: costoUsd(m.id),
    change: yoy(m.id),
  }));

  return (
    <figure className="fd-card my-8 px-5 pt-5 pb-4">
      <figcaption className="mb-4">
        <h3 className="font-mono text-micro uppercase tracking-label-wide text-muted m-0 scroll-mt-24">
          Costo de construcción del metro cuadrado en CABA
        </h3>
        <p className="font-mono text-xs text-muted mt-1.5 opacity-85 leading-[1.6]">
          {LAST_UPDATED}
          {IS_PROVISIONAL && " · dato provisorio"} · pesos por m² de superficie
          construida
        </p>
      </figcaption>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="fd-th">Modelo de edificio</th>
              <th className="fd-th text-right pl-3">$ por m²</th>
              <th className="fd-th text-right pl-3">Interanual</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="fd-td align-top">
                  <span className="text-ink">{r.label}</span>
                  <span className="block text-muted text-[11.5px] leading-[1.5] mt-0.5">
                    {r.description}
                  </span>
                  {r.usd !== null && (
                    <span className="block text-muted text-[11.5px] leading-[1.5] mt-0.5">
                      ≈ {formatUsd(r.usd)} por m²
                    </span>
                  )}
                </td>
                <td className="fd-td text-right pl-3 align-top text-ink tabular-nums whitespace-nowrap">
                  {formatArs(r.ars)}
                </td>
                <td className="fd-td text-right pl-3 align-top text-ink/90 tabular-nums whitespace-nowrap">
                  {r.change === null ? "—" : formatPct(r.change)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="font-mono text-xs text-muted mt-4 leading-[1.6]">
        Cuánto sale el metro cuadrado de construcción en la Ciudad de Buenos
        Aires, según los cuatro modelos de edificio que releva IDECBA. Para
        estimar una obra, multiplica los metros cuadrados a construir por el
        valor del modelo que más se parezca a lo que vas a levantar.
      </p>

      <p className="font-mono text-[11.5px] text-muted mt-3 leading-[1.6] opacity-85">
        Es el <strong className="font-medium">costo directo</strong>:
        materiales, mano de obra y gastos generales de obra.{" "}
        <strong className="font-medium">No incluye</strong> el terreno, los
        honorarios profesionales, los derechos de construcción, el IVA, los
        gastos financieros ni el beneficio de la empresa constructora, así que
        el precio final de una obra es bastante mayor que esta cifra. Los cuatro
        modelos son edificios de departamentos: no hay un modelo de vivienda
        unifamiliar en esta serie. La conversión a dólares es nuestra, al
        promedio del dólar blue del trimestre. Fuente: IDECBA, datos hasta{" "}
        {LAST_UPDATED}
        {IS_PROVISIONAL && " (provisorio)"}.
      </p>
    </figure>
  );
}

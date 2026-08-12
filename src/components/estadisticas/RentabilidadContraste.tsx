import {
  barrio,
  DEFAULT_SIZE,
  formatYield,
  LAST_UPDATED,
  ranked,
  REFERENCE_AREA,
  SIZES,
} from "@/content/estadisticas/data/rentabilidad-caba";

// The page checked against somebody else's arithmetic.
//
// Everything else here is derived from two IDECBA tables and an exchange rate,
// which means a mistake anywhere in the chain would produce numbers that still
// looked entirely reasonable. The only real defence is an independent
// measurement, and one exists: Zonaprop publishes a monthly rentability index
// built from its own listings — a different portal, a different sample, a
// monthly rather than quarterly window, and its own way of turning pesos into
// dollars. Nothing about it is downstream of anything here.
//
// The agreement is close enough to be worth showing, and the disagreement is
// worth showing too: our figures run consistently above theirs. Both are
// computed below from whatever the current data says rather than written down,
// so this section cannot quietly become a claim about a comparison that no
// longer holds.
//
// ── The thing this section is really for ──────────────────────────────────
// Not "we agree with Zonaprop", which would be a strange thing for a page to
// want. It is the coverage gap. IDECBA withholds rent for the barrios with the
// fewest listings, which are the cheapest ones, which are the highest-yielding
// ones — so this page's range is clipped at exactly the end its own argument
// points to. Zonaprop covers those barrios and puts them well above anything
// here. That correction belongs on the page, and it can only come from outside.
//
// ── Maintenance ───────────────────────────────────────────────────────────
// `REFERENCE` is a hand-entered snapshot with a date, and it does not refresh
// with `bun run data:caba`. It will drift. Both dates are printed side by side
// wherever a figure from it appears, so a stale snapshot reads as a comparison
// across time rather than as a contradiction — but when the gap gets past a
// couple of quarters, re-read the source below and replace the block.

const SIZE = SIZES.find((s) => s.id === DEFAULT_SIZE)!;

/**
 * Zonaprop's gross yields for 2-ambiente flats, as published in La Nación on
 * 23 July 2026 from Zonaprop's June 2026 index.
 *
 * https://www.lanacion.com.ar/propiedades/casas-y-departamentos/cuales-son-los-barrios-con-mayor-rentabilidad-bruta-para-invertir-en-alquiler-nid23072026/
 *
 * Their ten highest and ten lowest barrios — the article publishes the two
 * ends, not the middle, so this is not a sample of the city and no statistic
 * here treats it as one. It is used for two things only: barrio-by-barrio
 * agreement where both sources have a figure, and the list of barrios only they
 * cover.
 */
const REFERENCE = {
  source: "Zonaprop",
  via: "La Nación",
  when: "junio de 2026",
  href: "https://www.lanacion.com.ar/propiedades/casas-y-departamentos/cuales-son-los-barrios-con-mayor-rentabilidad-bruta-para-invertir-en-alquiler-nid23072026/",
  /** Their city-wide figure for the same month, and its payback. */
  ciudad: 5.89,
  ciudadPayback: 17,
  /** Their reference surface, which differs from IDECBA's — worth naming, since
   * it is one of the reasons the two levels differ. */
  area: 50,
  barrios: {
    "villa-lugano": 10.5,
    "nueva-pompeya": 8.0,
    "la-boca": 8.0,
    "villa-riachuelo": 7.8,
    "parque-patricios": 7.8,
    floresta: 7.4,
    balvanera: 7.3,
    "san-nicolas": 7.2,
    "parque-avellaneda": 7.2,
    "san-cristobal": 7.1,
    "puerto-madero": 3.4,
    palermo: 4.7,
    nunez: 4.8,
    belgrano: 4.8,
    colegiales: 5.0,
    saavedra: 5.0,
    retiro: 5.2,
    "villa-devoto": 5.3,
    coghlan: 5.4,
    recoleta: 5.4,
  } as Record<string, number>,
};

const dec = (v: number, places = 2): string =>
  v.toFixed(places).replace(".", ",");

const signed = (v: number): string =>
  `${v >= 0 ? "+" : "−"}${dec(Math.abs(v), 2)}`;

/** Pearson correlation. Quoted rather than a rank correlation because the
 * question is whether the two agree on *how much* a barrio yields, not only on
 * the order — and the article's top-and-bottom shape already guarantees a
 * decent rank agreement. */
function pearson(xs: number[], ys: number[]): number {
  const n = xs.length;
  const mx = xs.reduce((s, x) => s + x, 0) / n;
  const my = ys.reduce((s, y) => s + y, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
    syy += (ys[i] - my) ** 2;
  }
  return sxy / Math.sqrt(sxx * syy);
}

export function RentabilidadContraste() {
  const paired: { id: string; label: string; theirs: number; ours: number }[] =
    [];
  const onlyTheirs: { label: string; theirs: number }[] = [];

  for (const [id, theirs] of Object.entries(REFERENCE.barrios)) {
    const mine = barrio(id, DEFAULT_SIZE);
    if (mine) paired.push({ id, label: mine.label, theirs, ours: mine.value });
    else onlyTheirs.push({ label: id, theirs });
  }
  if (paired.length < 3) return null;

  paired.sort((a, b) => b.ours - a.ours);
  onlyTheirs.sort((a, b) => b.theirs - a.theirs);

  const r = pearson(
    paired.map((p) => p.theirs),
    paired.map((p) => p.ours),
  );
  const offset =
    paired.reduce((s, p) => s + (p.ours - p.theirs), 0) / paired.length;

  const order = ranked("barrios", DEFAULT_SIZE);
  const ourTop = order[0].value;
  const theirTop = Math.max(...Object.values(REFERENCE.barrios));

  // Their labels are ids for the barrios we have no row for, so give them a
  // readable name from the ones they do share with the registry.
  const pretty = (id: string): string =>
    id
      .split("-")
      .map((w) => w[0].toUpperCase() + w.slice(1))
      .join(" ");

  return (
    <figure className="fd-card my-8 px-5 pt-5 pb-4">
      <figcaption className="mb-4">
        <h3 className="font-mono text-micro uppercase tracking-label-wide text-muted m-0 scroll-mt-24">
          Los mismos barrios, medidos por otra fuente
        </h3>
        <p className="font-mono text-xs text-muted mt-1.5 opacity-85 leading-[1.6]">
          Nuestro cálculo sobre IDECBA, {LAST_UPDATED} · {REFERENCE.source},{" "}
          {REFERENCE.when} · {SIZE.label}
        </p>
      </figcaption>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="fd-th">Barrio</th>
              <th className="fd-th text-right pl-3">Esta página</th>
              <th className="fd-th text-right pl-3">{REFERENCE.source}</th>
              <th className="fd-th text-right pl-3">Diferencia</th>
            </tr>
          </thead>
          <tbody>
            {paired.map((p) => (
              <tr key={p.id}>
                <td className="fd-td align-top text-ink">{p.label}</td>
                <td className="fd-td text-right pl-3 align-top tabular-nums whitespace-nowrap text-ink">
                  {formatYield(p.ours)}
                </td>
                <td className="fd-td text-right pl-3 align-top tabular-nums whitespace-nowrap text-ink/90">
                  {formatYield(p.theirs)}
                </td>
                <td className="fd-td text-right pl-3 align-top tabular-nums whitespace-nowrap text-muted">
                  {signed(p.ours - p.theirs)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="font-mono text-xs text-muted mt-4 leading-[1.6]">
        Los dos cálculos coinciden en la forma y difieren en el nivel. La
        correlación entre las {paired.length} mediciones que se pueden aparear
        es de {dec(r)}, y esta página queda en promedio {signed(offset)} puntos
        por encima. Son dos relevamientos independientes: portales distintos,
        muestras distintas, y una superficie de referencia de {REFERENCE.area}{" "}
        m² contra los {REFERENCE_AREA[DEFAULT_SIZE]} m² que usa IDECBA.
      </p>

      {onlyTheirs.length > 0 && (
        <p className="font-mono text-xs text-muted mt-3 leading-[1.6]">
          <strong className="font-medium text-ink">
            Lo que esta página no ve.
          </strong>{" "}
          {REFERENCE.source} publica{" "}
          {onlyTheirs.map((b, i) => (
            <span key={b.label}>
              {i > 0 && (i === onlyTheirs.length - 1 ? " y " : ", ")}
              {pretty(b.label)} ({dec(b.theirs, 1)} %)
            </span>
          ))}
          , barrios para los que IDECBA no publica alquiler porque tienen muy
          pocos avisos. No es un recorte casual: son los más baratos de la
          Ciudad, que por lo que muestra este mismo análisis son los que más
          rinden. El techo de esta página es {formatYield(ourTop)} y el de ellos{" "}
          {dec(theirTop, 1)} %, así que el rango real de la Ciudad es más ancho
          que el que se ve en el mapa de arriba, y lo es hacia arriba.
        </p>
      )}

      <p className="font-mono text-[11.5px] text-muted mt-3 leading-[1.6] opacity-85">
        {REFERENCE.source} ubicaba el promedio de la Ciudad en{" "}
        {dec(REFERENCE.ciudad, 2)} % y {REFERENCE.ciudadPayback} años de repago
        en {REFERENCE.when}. Las cifras de {REFERENCE.source} están tomadas de{" "}
        <a
          href={REFERENCE.href}
          rel="nofollow noopener"
          target="_blank"
          className="underline underline-offset-2 hover:text-ink"
        >
          {REFERENCE.via}
        </a>{" "}
        y corresponden a {REFERENCE.when}; las de esta página, al {LAST_UPDATED}
        . La comparación es entre dos momentos distintos y entre dos
        metodologías distintas: sirve para ver si las dos cuentan la misma
        historia, no para arbitrar cuál tiene razón en el segundo decimal.
      </p>
    </figure>
  );
}

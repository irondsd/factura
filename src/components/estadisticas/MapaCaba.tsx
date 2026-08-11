"use client";

import { useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { SegmentedControl } from "@/components/ui";
import geo from "@/content/estadisticas/data/caba-geo.json";
import { cn } from "@/lib/cn";

// A shaded map of CABA, by barrio or by comuna, plus the table that carries the
// same numbers as text. Shared by every map on /estadisticas — it knows about
// the city's geometry and nothing about what is being measured.
//
// ── What it does and does not know ────────────────────────────────────────
// It takes regions with a `value` (a number, to shade and sort by) and a
// `display` (the string to print). It never learns whether that is dollars per
// metre or pesos a month: the server component formats, this one draws. If a
// prop ever has to say which metric is on screen, the seam has moved.
//
// The geometry is imported here rather than passed in. Threading 42 KB of path
// data through props would put it in the page's HTML *and* again in the RSC
// payload; imported, it sits in a JS chunk that is cached across the section.
//
// ── Why the table is not optional ─────────────────────────────────────────
// The map is the second representation, not the first. A choropleth carries no
// text, so on its own the page would ship a picture of its data and no data:
// nothing for a crawler (see AUTHORING.md §7), nothing for a screen reader,
// and 48 polygons that on a phone are smaller than a fingertip. The table is
// the answer to all three, and it is why the map can stay simple.
//
// ── Why the switches live on this side of the seam ────────────────────────
// Everything the switches change — the shading, the stat line, the coverage
// note, the table — changes together. A stat line still quoting 2 ambientes
// under a map showing 3 is worse than no stat line at all. A client component
// is server-rendered too, so the initial HTML carries the heading, the figures
// and the table; only the interaction waits for the browser.

export type MapRegion = {
  /** Must match a key in the geometry for this view's `geo`. */
  id: string;
  label: string;
  /** Secondary line: the comuna a barrio is in, the barrios a comuna groups. */
  meta: string;
  /** What the shading and the sort order are based on. `null` where the source
   * withheld the figure — not zero. */
  value: number | null;
  /** The headline figure, pre-formatted. Not necessarily a rendering of
   * `value`: the rent map shades by price per m² so that one scale can serve
   * all three unit sizes, while printing the monthly rent, which is the number
   * a reader came for. Within any one view the two rank identically, so the
   * colour never contradicts the figure beside it. */
  display: string | null;
  /** An optional second figure, shown under `display` in the tooltip and in its
   * own table column. `null` where there is none to show. */
  sub?: string | null;
};

export type MapView = {
  geo: "barrios" | "comunas";
  regions: MapRegion[];
  /** The line under the heading, describing *this* cut. */
  stat: string;
  /** The coverage sentence for this cut — how many regions are shaded. */
  note: string;
};

export type MapDimension = {
  name: string;
  /** Spoken label for the control. */
  label: string;
  options: { value: string; label: string }[];
};

/** Class index 0-5 → the ramp step defined in globals.css. */
const SHADE = [
  "var(--choro-1)",
  "var(--choro-2)",
  "var(--choro-3)",
  "var(--choro-4)",
  "var(--choro-5)",
  "var(--choro-6)",
];

/** Where the ramp gets dark enough that ink stops working on it — used for the
 * legend swatch labels, the only text drawn on the colours. */
const DARK_FROM = 4;

/** `lo` wins when the range is inverted, which is what happens when the tooltip
 * is wider than the map — on a narrow phone with a comuna's long list of
 * barrios. Pinning it to the left edge beats centring it on a negative middle. */
const clamp = (v: number, lo: number, hi: number): number =>
  Math.max(lo, Math.min(v, Math.max(lo, hi)));

export function MapaCaba({
  title,
  dimensions,
  initial,
  views,
  breaks,
  legend,
  noDataLabel,
  dataDate,
  columns,
  ariaLabel,
}: {
  title: string;
  /** One or two switches. The view key is their values joined by "-", in this
   * order — the caller builds `views` to match. */
  dimensions: MapDimension[];
  initial: Record<string, string>;
  views: Record<string, MapView>;
  /** Upper bounds of the shading classes; `SHADE.length - 1` of them. */
  breaks: number[];
  /** One label per class, lowest first. */
  legend: { label: string }[];
  noDataLabel: string;
  /** Which period the shading is of. Printed against the map rather than only
   * in the small print, because "how old is this?" is the first question a
   * price map has to answer and the reader shouldn't have to hunt for it. */
  dataDate: string;
  /** `sub` opts the table into a second value column, and the tooltip into a
   * second figure. Omit it and neither appears. */
  columns: { region: string; value: string; sub?: string };
  ariaLabel: string;
}) {
  const uid = useId();
  const [picked, setPicked] = useState(initial);
  const [hovered, setHovered] = useState<string | null>(null);
  /** Cursor position inside the map box, plus the box's own width, for the
   * tooltip. `null` whenever the pointer isn't over the map — which is also how
   * hovering a *table* row highlights its region without summoning a tooltip
   * out in the table. */
  const [pointer, setPointer] = useState<{
    x: number;
    y: number;
    boxWidth: number;
  } | null>(null);

  // The tooltip is centred on the cursor, so keeping it inside the figure needs
  // its width — and that can't be assumed. A barrio's is "Palermo · Comuna 14",
  // a comuna's is the whole list of barrios it groups, several times longer.
  // Measured after paint rather than guessed at.
  const tipRef = useRef<HTMLDivElement>(null);
  const [tipWidth, setTipWidth] = useState(0);
  useLayoutEffect(() => {
    if (tipRef.current) setTipWidth(tipRef.current.offsetWidth);
  }, [hovered]);

  const key = dimensions.map((d) => picked[d.name]).join("-");
  const view = views[key] ?? views[dimensions.map((d) => initial[d.name]).join("-")];

  const paths = geo[view.geo] as Record<string, string>;

  const classOf = (value: number): number => {
    const i = breaks.findIndex((b) => value < b);
    return i === -1 ? breaks.length : i;
  };

  /** Dearest first, with the withheld regions last — they have no rank, so they
   * are listed rather than ordered. */
  const sorted = useMemo(() => {
    const withValue = view.regions.filter((r) => r.value !== null);
    const without = view.regions.filter((r) => r.value === null);
    withValue.sort((a, b) => (b.value as number) - (a.value as number));
    return [...withValue, ...without];
  }, [view]);

  const active = hovered ? view.regions.find((r) => r.id === hovered) : null;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <h3 className="font-mono text-micro uppercase tracking-label-wide text-muted m-0 scroll-mt-24">
            {title}
          </h3>
          {/* Always the summary. Pointing at a region used to replace this
              line, which meant the one figure a reader might be comparing
              against vanished exactly when they went looking for something to
              compare — the region's own value belongs in the tooltip. */}
          <p className="font-mono text-xs text-muted mt-1.5 opacity-85 leading-[1.6]">
            {view.stat}
          </p>
        </div>
        {/* Not `flex-none`: that sizes the group to its content, so on a phone
            it stays wider than the column and pushes the whole page into a
            horizontal scroll instead of letting its own wrap take over. */}
        <div className="flex flex-wrap gap-2">
          {dimensions.map((d) => (
            <SegmentedControl
              key={d.name}
              label={d.label}
              options={d.options}
              value={picked[d.name]}
              onChange={(v) => setPicked((p) => ({ ...p, [d.name]: v }))}
            />
          ))}
        </div>
      </div>

      <ul className="flex flex-wrap items-center gap-x-1 gap-y-1.5 mb-3 list-none p-0 m-0">
        {legend.map((entry, i) => (
          <li
            key={entry.label}
            className={cn(
              "font-mono text-[10px] leading-none px-1.5 py-[5px] border border-line/60",
              i >= DARK_FROM ? "text-paper" : "text-ink",
            )}
            style={{ background: SHADE[i] }}
          >
            {entry.label}
          </li>
        ))}
        <li className="font-mono text-[10px] leading-none px-1.5 py-[5px] border border-line/60 text-ink relative">
          <span
            aria-hidden
            className="absolute inset-0"
            style={{
              background: `var(--choro-none)`,
              backgroundImage: `repeating-linear-gradient(45deg, transparent 0 3px, var(--choro-none-line) 3px 4px)`,
            }}
          />
          <span className="relative">{noDataLabel}</span>
        </li>
      </ul>

      <div
        className="relative"
        onPointerMove={(e) => {
          const box = e.currentTarget.getBoundingClientRect();
          setPointer({
            x: e.clientX - box.left,
            y: e.clientY - box.top,
            boxWidth: box.width,
          });
        }}
        onPointerLeave={() => {
          setPointer(null);
          setHovered(null);
        }}
      >
        <svg
          viewBox={geo.viewBox}
          role="img"
          aria-label={ariaLabel}
          className="w-full h-auto max-h-[70vh] block mx-auto"
        >
          <defs>
            {/* Sized in viewBox units, which are ~0.5 px at the width this map
                is drawn: a 6-unit tile came out under 2 px and read as flat
                grey, which is exactly the confusion with "cheapest" the hatch
                exists to prevent. 16 units is a ~7 px stripe at desktop width
                and still legible on a phone. */}
            <pattern
              id={`${uid}-none`}
              width="16"
              height="16"
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(45)"
            >
              <rect width="16" height="16" fill="var(--choro-none)" />
              <line
                x1="0"
                y1="0"
                x2="0"
                y2="16"
                stroke="var(--choro-none-line)"
                strokeWidth="5"
              />
            </pattern>
          </defs>

          {view.regions.map((r) => {
            const d = paths[r.id];
            if (!d) return null;
            return (
              <path
                key={r.id}
                d={d}
                fill={
                  r.value === null
                    ? `url(#${uid}-none)`
                    : SHADE[classOf(r.value)]
                }
                stroke="var(--card)"
                strokeWidth={0.8}
                vectorEffect="non-scaling-stroke"
                onPointerEnter={() => setHovered(r.id)}
                className="cursor-default"
              />
            );
          })}

          {/* The hover highlight, drawn after every region rather than as a
              stroke on the hovered one.

              SVG has no z-index — paint order is document order — so an outline
              on a path in the middle of the list is painted over by whichever
              neighbours come after it. That showed up as a border that appeared
              on some sides of a barrio and not others, depending only on where
              it happened to sit in the list. Drawn last, a translucent ink wash
              is on top of everything by construction, and it darkens the hatched
              "sin dato" regions exactly as readably as the shaded ones, which a
              per-class darker fill could not. */}
          {hovered && paths[hovered] && (
            <path
              d={paths[hovered]}
              fill="var(--ink)"
              fillOpacity={0.26}
              stroke="var(--ink)"
              strokeOpacity={0.75}
              strokeWidth={1.5}
              vectorEffect="non-scaling-stroke"
              pointerEvents="none"
            />
          )}
        </svg>

        {/* Follows the cursor instead of living in a fixed slot: on a map the
            thing you are pointing at is where your eye already is. */}
        {active && pointer && (
          <div
            ref={tipRef}
            role="status"
            aria-live="polite"
            // `w-max` is load-bearing: without an intrinsic width, an absolutely
            // positioned box shrink-to-fits against the *right edge of its
            // container*, so a tooltip near the east of the city collapsed into
            // a 58 px column — and that squeezed width then fed back into the
            // clamp below, pinning it there. Sized by its content instead,
            // capped, and only then positioned.
            className="pointer-events-none absolute z-10 w-max max-w-[15rem] -translate-x-1/2 -translate-y-full border border-line bg-card px-2 py-1 font-mono text-[11px] leading-snug shadow-pop"
            style={{
              left: clamp(pointer.x, tipWidth / 2, pointer.boxWidth - tipWidth / 2),
              top: pointer.y - 10,
            }}
          >
            <div>
              <span className="text-ink">{active.label}</span>
              <span className="text-muted"> · {active.meta}</span>
            </div>
            <div className="text-ink">
              {active.display ?? noDataLabel}
              {active.sub && (
                <span className="text-muted"> · {active.sub}</span>
              )}
            </div>
          </div>
        )}
      </div>

      <p className="font-mono text-micro uppercase tracking-label-wide text-muted mt-3">
        {dataDate}
      </p>

      <p className="font-mono text-[11.5px] text-muted mt-2 leading-[1.6] opacity-85">
        {view.note}
      </p>

      <table className="w-full border-collapse mt-4">
        <thead>
          <tr>
            <th className="fd-th">{columns.region}</th>
            <th className="fd-th text-right">{columns.value}</th>
            {columns.sub && (
              <th className="fd-th text-right">{columns.sub}</th>
            )}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr
              key={r.id}
              onMouseEnter={() => setHovered(r.id)}
              onMouseLeave={() => setHovered((h) => (h === r.id ? null : h))}
              className={cn(hovered === r.id && "bg-paper")}
            >
              <td className="fd-td">
                <span className="text-ink">{r.label}</span>
                <span className="text-muted"> · {r.meta}</span>
              </td>
              <td
                className={cn(
                  "fd-td text-right tabular-nums whitespace-nowrap",
                  r.display ? "text-ink" : "text-muted",
                )}
              >
                {r.display ?? noDataLabel}
              </td>
              {columns.sub && (
                <td className="fd-td text-right tabular-nums whitespace-nowrap text-muted">
                  {r.sub ?? "—"}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

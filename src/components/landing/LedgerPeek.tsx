import { cn } from "@/lib/cn";
import { Eyebrow, Wordmark } from "./parts";

// A faithful, static slice of the product's Overview screen — used as the
// "peek inside" on the landing page. Purely visual: no data, no interactivity.
// Vendor swatch colors come from the shared .vbg-* classes (globals.css); only
// genuinely dynamic values (bar heights, the donut ring) use inline styles, the
// same way the real chart components do.

type Vendor = "dark-earth" | "burnt-orange" | "taupe" | "sage";

const SHARE: { name: string; pct: number; vendor: Vendor; awaiting?: boolean }[] =
  [
    { name: "Expensas", pct: 84, vendor: "dark-earth" },
    { name: "MetroGAS", pct: 6, vendor: "burnt-orange", awaiting: true },
    { name: "Personal", pct: 6, vendor: "taupe" },
    { name: "Edesur", pct: 4, vendor: "sage" },
  ];

const vbg: Record<Vendor, string> = {
  "dark-earth": "vbg-dark-earth",
  "burnt-orange": "vbg-burnt-orange",
  taupe: "vbg-taupe",
  sage: "vbg-sage",
};

// Conic ring for the donut, built from the cumulative share. Uses vendor CSS
// vars (no raw hex), but the gradient itself can't be a utility class.
const donutRing = (() => {
  const varOf: Record<Vendor, string> = {
    "dark-earth": "var(--vendor-dark-earth)",
    "burnt-orange": "var(--vendor-burnt-orange)",
    taupe: "var(--vendor-taupe)",
    sage: "var(--vendor-sage)",
  };
  let at = 0;
  const stops = SHARE.map((s) => {
    const start = at;
    at += s.pct;
    return `${varOf[s.vendor]} ${start}% ${at}%`;
  });
  return `conic-gradient(from -90deg, ${stops.join(", ")})`;
})();

export function LedgerPeek({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className="receipt-edge bg-card border border-line shadow-receipt"
    >
      {/* faux top bar */}
      <div className="flex items-center justify-between gap-3 py-3 px-4 border-b border-line">
        <div className="flex items-center gap-[18px] flex-wrap">
          <Wordmark size={16} />
          <div className="flex gap-3.5">
            <PeekNav active>Overview</PeekNav>
            <PeekNav>Insights</PeekNav>
            <PeekNav>Bills</PeekNav>
          </div>
        </div>
      </div>

      {/* total block */}
      <div className="pt-[18px] px-[18px] pb-4">
        <div className="mb-2">
          <Eyebrow>Palermo · June 2026 so far</Eyebrow>
        </div>
        <div className="font-display font-semibold text-[42px] tracking-tight leading-none text-ink">
          $ 429.638
        </div>
        <div className="font-mono text-[11.5px] text-muted mt-2.5">
          3 of 4 bills in · ≈ US$ 295,39 ·{" "}
          <span className="text-accent">1 awaiting</span>
        </div>
      </div>

      <SpendChart />

      {/* vendor-share card */}
      <div className="border-t border-line pt-4 px-[18px] pb-7">
        <div className="flex items-center justify-between mb-4">
          <Eyebrow className="text-ink tracking-[0.14em]">
            Where the money goes
          </Eyebrow>
          <MiniToggle left="ARS" right="USD" />
        </div>
        <div
          className={cn(
            "flex items-center gap-[22px]",
            compact ? "flex-nowrap" : "flex-wrap",
          )}
        >
          {/* donut */}
          <div
            className="relative w-[124px] h-[124px] rounded-full flex-none"
            style={{ background: donutRing }}
          >
            <div className="absolute inset-[22px] rounded-full bg-card flex flex-col items-center justify-center">
              <span className="font-display font-semibold text-[19px] tracking-[-0.01em]">
                AR$
              </span>
              <span className="font-mono text-[8.5px] tracking-[0.16em] text-muted uppercase mt-0.5">
                by vendor
              </span>
            </div>
          </div>
          {/* legend */}
          <div className="flex-1 min-w-[160px] flex flex-col gap-[9px]">
            {SHARE.map((s) => (
              <div key={s.name} className="flex items-center gap-[9px]">
                <span
                  className={cn("w-[11px] h-[11px] flex-none", vbg[s.vendor])}
                />
                <span className="font-mono text-[13px] text-ink whitespace-nowrap">
                  {s.awaiting && <span className="text-accent">△ </span>}
                  {s.name}
                </span>
                <span className="ml-auto font-mono text-[13px] font-medium text-ink">
                  {s.pct}%
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function PeekNav({
  children,
  active,
}: {
  children: React.ReactNode;
  active?: boolean;
}) {
  return (
    <span
      className={cn(
        "font-mono text-[10px] tracking-[0.14em] uppercase underline-offset-[3px]",
        active ? "text-accent underline decoration-dotted" : "text-muted",
      )}
    >
      {children}
    </span>
  );
}

// Decorative ARS/USD (or 12 MO/24 MO) toggle — the left segment reads active.
function MiniToggle({ left, right }: { left: string; right: string }) {
  return (
    <div className="inline-flex border border-line">
      <span className="font-mono text-[9.5px] tracking-[0.08em] py-[3px] px-[7px] uppercase bg-ink text-paper">
        {left}
      </span>
      <span className="font-mono text-[9.5px] tracking-[0.08em] py-[3px] px-[7px] uppercase text-muted">
        {right}
      </span>
    </div>
  );
}

// Monthly vendor breakdown in thousands of pesos; trailing months are still
// filling in (rendered as a single gray "incomplete" bar).
type Month =
  | { m: string; expensas: number; personal: number; metrogas: number; edesur: number }
  | { m: string; incomplete: number };

const MONTHS: Month[] = [
  { m: "Jul", expensas: 430, personal: 18, metrogas: 55, edesur: 17 },
  { m: "Aug", expensas: 435, personal: 15, metrogas: 62, edesur: 18 },
  { m: "Sep", expensas: 430, personal: 16, metrogas: 20, edesur: 14 },
  { m: "Oct", expensas: 440, personal: 17, metrogas: 28, edesur: 15 },
  { m: "Nov", expensas: 438, personal: 16, metrogas: 25, edesur: 16 },
  { m: "Dec", expensas: 435, personal: 15, metrogas: 24, edesur: 16 },
  { m: "Jan", expensas: 432, personal: 14, metrogas: 12, edesur: 14 },
  { m: "Feb", expensas: 428, personal: 16, metrogas: 20, edesur: 14 },
  { m: "Mar", expensas: 455, personal: 18, metrogas: 30, edesur: 19 },
  { m: "Apr", incomplete: 515 },
  { m: "May", incomplete: 520 },
  { m: "Jun", incomplete: 430 },
];

const MAX = 600; // $600k ceiling
const GRID_Y = [600, 450, 300, 150, 0];
const STACK: { key: "expensas" | "personal" | "metrogas" | "edesur"; vbg: string }[] =
  [
    { key: "expensas", vbg: "vbg-dark-earth" },
    { key: "personal", vbg: "vbg-taupe" },
    { key: "metrogas", vbg: "vbg-burnt-orange" },
    { key: "edesur", vbg: "vbg-sage" },
  ];

function SpendChart() {
  return (
    <div className="border-t border-line py-4 px-[18px]">
      <div className="flex items-start justify-between gap-2.5 mb-[26px]">
        <div>
          <Eyebrow className="text-ink tracking-[0.14em] whitespace-nowrap">
            Total spend over time
          </Eyebrow>
          <div className="font-mono text-[11px] text-muted mt-1">
            Stacked by vendor
          </div>
        </div>
        <MiniToggle left="ARS" right="USD" />
      </div>

      {/* plot */}
      <div className="relative h-[132px] pl-[34px]">
        {GRID_Y.map((v, i) => (
          <div
            key={v}
            className="absolute left-0 right-0 h-0"
            style={{ top: `${(i / (GRID_Y.length - 1)) * 100}%` }}
          >
            <span className="absolute left-0 top-0 -translate-y-1/2 font-mono text-[8.5px] text-muted whitespace-nowrap">
              {v === 0 ? "$0" : `$${v}k`}
            </span>
            <div className="absolute left-[34px] right-0 top-0 border-t border-dotted border-line" />
          </div>
        ))}
        {/* bars */}
        <div className="absolute left-[34px] right-0 top-0 bottom-0 flex items-end gap-1">
          {MONTHS.map((d) => (
            <div
              key={d.m}
              className="flex-1 h-full flex flex-col-reverse"
            >
              {"incomplete" in d ? (
                <div
                  className="bg-[color-mix(in_srgb,var(--muted)_45%,var(--paper))]"
                  style={{ height: `${(d.incomplete / MAX) * 100}%` }}
                />
              ) : (
                STACK.map((o) => (
                  <div
                    key={o.key}
                    className={o.vbg}
                    style={{ height: `${(d[o.key] / MAX) * 100}%` }}
                  />
                ))
              )}
            </div>
          ))}
        </div>
      </div>

      {/* month labels */}
      <div className="flex gap-1 pl-[34px] mt-1.5">
        {MONTHS.map((d) => (
          <span
            key={d.m}
            className="flex-1 text-center font-mono text-[8.5px] text-muted"
          >
            {d.m}
          </span>
        ))}
      </div>

      {/* legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-3.5 pl-[34px]">
        {[
          ["Edesur", "vbg-sage"],
          ["MetroGAS", "vbg-burnt-orange"],
          ["Personal", "vbg-taupe"],
          ["Expensas", "vbg-dark-earth"],
        ].map(([name, klass]) => (
          <span key={name} className="inline-flex items-center gap-1.5">
            <span className={cn("w-[9px] h-[9px] flex-none", klass)} />
            <span className="font-mono text-[10.5px] text-muted">{name}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

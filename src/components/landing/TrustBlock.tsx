import { defaultLocale, type Locale } from "@/i18n/config";
import { getI18n } from "@/i18n/server";
import { cn } from "@/lib/cn";

// The trust block: the five things Factura does with a bill, set as a ledger —
// numbered entries divided by hairlines, headed by a title and the ledger's own
// count of itself.
//
// Sized by container query, not by viewport, because it has to live at three
// very different widths: the landing page's full-width band (~980px), a guide
// or statistics article column (680–760px), and a phone. A viewport breakpoint
// can't tell those apart — the landing page's own body column is 560px, so
// "desktop" says nothing about how much room this block actually has. Reading
// its own box instead means it can be dropped anywhere, MDX included, with no
// variant to choose:
//
//   under 32rem   stacked slip — one entry under the next
//   32rem–56rem   ledger rows — number, heading, body across the line
//   56rem and up  the five-column strip
//
// The three are one layout with two things swapped: the grid template on the
// list, and the grid template inside each entry.

// One typographic mark per entry, each standing for what that entry does:
// pilcrow for the text we lift off the bill, guillemet for the jump forward
// into next month, percent for the market statistics, tilde for the shape of a
// trend, plus-minus for how far a cost moves once inflation is counted. They
// read as ledger notation rather than as an icon set, which is also why they
// live here and not in the dictionaries — they say nothing a translator could
// change. Indexed by position, so an entry added to the dictionaries simply
// arrives unmarked until a glyph is picked for it.
//
// Every glyph must exist in the *latin subset* of IBM Plex Mono, which is all
// `src/config/fonts.ts` loads — the same constraint the burger menu's markers
// carry, and the reason the obvious picks are not here. `≈` and `→` are both
// missing from it (`↓` and `↑` are not), so they render in whatever the system
// falls back to, at the wrong weight and width. Measure a replacement before
// using it: in a monospace font a covered glyph has exactly the advance width
// of `M`, and a fallback almost never does.
const GLYPHS = ["¶", "»", "%", "~", "±"];

// Divider between entries. The 70%-of-line hairline is the landing page's own
// rule weight, one step softer than a --line border, so the entries read as
// ruling rather than as five separate boxes.
const HAIRLINE = "border-[color-mix(in_srgb,var(--line)_70%,transparent)]";

// Rules run between entries and nowhere else, so the first entry has no rule
// above it and the last none below. In the strip that same rule turns 90°: it
// becomes the left edge of every column but the first, and the padding turns
// with it.
const RULE_BEFORE = cn(
  HAIRLINE,
  "border-t pt-5 @4xl:border-t-0 @4xl:pt-0 @4xl:border-l @4xl:pl-6",
);
// The entry above pays for its own half of the gap — otherwise the rule sits
// tight under its last line and adrift from the entry it belongs to.
const RULE_AFTER = "pb-5 @4xl:pb-0 @4xl:pr-6";

// One entry. Grid throughout rather than flex-then-grid: only the template
// changes between the three sizes, so the switch is one property and there is
// no display swap to unwind at the top end.
const ENTRY = cn(
  "grid grid-cols-1 gap-y-2.5",
  "@lg:grid-cols-[4.5rem_minmax(0,15rem)_1fr] @lg:gap-x-5 @lg:gap-y-0 @lg:items-baseline",
  "@4xl:grid-cols-1 @4xl:gap-y-2.5 @4xl:items-stretch",
);

export async function TrustBlock({
  locale = defaultLocale,
  className,
}: {
  // Optional so MDX can place a bare <TrustBlock />. Both sections that do —
  // guides and statistics — are Spanish-only by layout guard, which is the same
  // reason the guide CTAs carry inline Spanish.
  locale?: Locale;
  className?: string;
}) {
  const { t } = await getI18n(locale);
  const { title, items } = t.trustBlock;
  const total = String(items.length).padStart(2, "0");
  const last = items.length - 1;

  return (
    <section className={cn("@container", className)}>
      <div className="fd-card px-6 pt-7 pb-9 @4xl:px-9 @4xl:pt-9 @4xl:pb-11">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1.5 border-b border-line pb-4 mb-7">
          {/* Smaller below the strip tier because those are the widths where
              this block sits inside somebody else's article — a guide's own
              section headings are 28–32px, and a promo that matches them reads
              as a section the reader is meant to have arrived at. */}
          <h2 className="font-display font-semibold text-[23px] @4xl:text-[30px] leading-[1.15] tracking-tight text-ink m-0">
            {title}
            <span className="text-accent">.</span>
          </h2>
          {/* The ledger counting itself, the way a printed slip does. Decoration,
              so it stays out of the accessibility tree. */}
          <span
            aria-hidden="true"
            className="font-mono text-micro uppercase tracking-label-wide text-muted"
          >
            {total} · {total}
          </span>
        </div>

        <div className="grid grid-cols-1 @4xl:grid-cols-5">
          {items.map((item, i) => (
            <div
              key={item.title}
              className={cn(
                ENTRY,
                i !== 0 && RULE_BEFORE,
                i !== last && RULE_AFTER,
              )}
            >
              {/* The entry's number, alone on its line. In the stacked and
                  strip tiers that line is the entry's full width; in the
                  ledger tier it is the number column, sitting on the
                  heading's baseline beside it. */}
              <span className="font-mono text-micro tracking-label text-accent">
                {String(i + 1).padStart(2, "0")}
              </span>
              <h3 className="font-display font-semibold text-[17px] @lg:text-[19px] leading-[1.2] tracking-tight text-ink text-pretty m-0">
                {/* The mark opens the heading rather than hanging off the far
                    end of the number's line, so it is read as belonging to the
                    words it introduces. It keeps the mono face, the regular
                    weight and the muted ink while the heading is display,
                    semibold and full-strength — three differences at once, so
                    it reads as a mark placed before the title and never as its
                    first character. */}
                {GLYPHS[i] && (
                  <span
                    aria-hidden="true"
                    className="font-mono font-normal text-[0.9em] text-muted mr-[0.5em]"
                  >
                    {GLYPHS[i]}
                  </span>
                )}
                {item.title}
              </h3>
              <p className="font-mono text-[12.5px] @lg:text-[13px] @4xl:text-[12.5px] leading-[1.65] text-muted text-pretty m-0">
                {item.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

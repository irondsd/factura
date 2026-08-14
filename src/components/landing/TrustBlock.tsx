import type { Locale } from "@/i18n/config";
import { getI18n } from "@/i18n/server";
import { cn } from "@/lib/cn";

// The trust block: the five things Factura does with a bill, set as one ledger
// strip — numbered columns divided by hairlines, headed by a title and the
// ledger's own count of itself.
//
// Sized by container query, not by viewport. The same block sits in a
// full-width band on the landing page and inside the /contacto shell, so it has
// to read off its own box rather than the screen's: a stacked slip when the box
// is narrow, five ruled columns once there is room for them. A viewport
// breakpoint would put five 100px columns inside the landing's receipt column.

// Divider between entries. The 70%-of-line hairline is the landing page's own
// rule weight, one step softer than a --line border, so the columns read as
// ruling rather than as five separate boxes.
const HAIRLINE = "border-[color-mix(in_srgb,var(--line)_70%,transparent)]";

export async function TrustBlock({
  locale,
  className,
}: {
  locale: Locale;
  className?: string;
}) {
  const { t } = await getI18n(locale);
  const { title, items } = t.trustBlock;
  const total = String(items.length).padStart(2, "0");
  const last = items.length - 1;

  return (
    <section className={cn("@container", className)}>
      <div className="fd-card px-6 pt-7 pb-9 @4xl:px-9 @4xl:pt-9 @4xl:pb-11">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1.5 border-b border-line pb-4 mb-7 @4xl:pb-4 @4xl:mb-7">
          <h2 className="font-display font-semibold text-[26px] @4xl:text-[30px] leading-[1.15] tracking-tight text-ink m-0">
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
                "flex flex-col gap-2.5",
                // Stacked: a rule above every entry but the first. Five across:
                // that rule moves to the left edge and becomes the column
                // divider, so entry one is flush and the rest are inset.
                i !== 0 &&
                  cn(
                    HAIRLINE,
                    "border-t pt-5 @4xl:border-t-0 @4xl:pt-0 @4xl:border-l @4xl:pl-6",
                  ),
                // Stacked, the rule between two entries is one entry's top
                // border, so the entry above has to pay for its own half of the
                // gap or the rule sits tight under its last line.
                i !== last && "pb-5 @4xl:pb-0 @4xl:pr-6",
              )}
            >
              <span className="font-mono text-micro tracking-label text-accent">
                {String(i + 1).padStart(2, "0")}
              </span>
              <h3 className="font-display font-semibold text-[17px] @4xl:text-[19px] leading-[1.2] tracking-tight text-ink text-pretty m-0">
                {item.title}
              </h3>
              <p className="font-mono text-[12.5px] leading-[1.65] text-muted text-pretty m-0">
                {item.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

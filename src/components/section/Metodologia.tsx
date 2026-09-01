import { METHODOLOGY_SECTION } from "@/content/headings";
import { cn } from "@/lib/cn";
import { type MethodologyMetadata, methodologyEntries } from "@/content-system/types";

// The "Metodología" block a page drops in with a bare <Metodologia />. Same
// contract as <Faq /> and <Fuentes />: the tag takes no props, the route
// injects `meta.methodology`, so the author picks the *placement* and the meta
// block owns the *content*.
//
// It answers, in a line each, the questions a reader asks before believing a
// figure — whose numbers, from when, covering what, measuring what, and what
// they cannot be used for. Every one of the five is optional, and the block
// draws the ones that are filled in, in the fixed order `METHODOLOGY_FIELDS`
// declares. That is what lets a statistics page reading one series say two
// things and a research page crossing four say all five, without either
// looking like a form with gaps in it.
//
// Ledger rows rather than a card: hairlines between rows of paper, on the
// page's own ground. A card here would compete with the closing CTA a few
// centimetres below it, and this block is an annex to the article, not another
// offer.
//
// Its heading is a real h2, unlike the FAQ's and the sources' eyebrows. The
// contents column links to all three the same way, and this is the one whose
// prose a reader lands *in* rather than scans — a labelled section rather than
// a labelled list.

export function Metodologia({ value }: { value?: MethodologyMetadata }) {
  const entries = methodologyEntries(value);
  if (entries.length === 0) return null;

  return (
    <section
      id={METHODOLOGY_SECTION.id}
      className="my-12 scroll-mt-24"
      aria-labelledby={`${METHODOLOGY_SECTION.id}-title`}
    >
      <h2
        id={`${METHODOLOGY_SECTION.id}-title`}
        className="font-display font-semibold text-[28px] sm:text-[32px] tracking-[-0.02em] leading-[1.15] mt-0 mb-5"
      >
        {METHODOLOGY_SECTION.text}
      </h2>

      {/* The hairlines are the container's own background showing through a
          1px gap, so a block of two rows and a block of five are separated by
          exactly the same rule — and a row can never end up with a doubled
          border because its neighbour was left out. */}
      <dl className="m-0 flex flex-col gap-px border border-line bg-line">
        {entries.map(({ key, label, text }) => (
          <div
            key={key}
            className="flex flex-col gap-[5px] bg-card px-[18px] py-[15px]"
          >
            {/* Limitations in accent: it is the line that says what the page
                does *not* support, and a reader who skims the block should
                still catch it. */}
            <dt
              className={cn(
                "fd-label text-[10px]",
                key === "limitations" && "text-accent",
              )}
            >
              {label}
            </dt>
            <dd className="m-0 font-mono text-[13px] leading-[1.65] text-pretty">
              {text}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

import Link from "next/link";
import { Eyebrow } from "@/components/landing/parts";
import { formatContentDateShort } from "@/lib/content-date";

// The homepage's window onto the editorial sections — Estadísticas,
// Investigaciones, Guías — three per block, newest first, each one a card with
// its own preview.
//
// This is the one place on the landing page that leaves the 560px receipt
// column: a three-up grid pinched to that width is three 170px slivers, so the
// caller hands it the wider band the TrustBlock and the footer already use.
//
// Ordering is the caller's, not this component's: it renders the blocks in the
// order it is given and badges the FIRST card of each as `NUEVO`, which is only
// correct because every caller passes them newest first. Said once here rather
// than re-derived per block — comparing dates in here would badge nothing on a
// block whose cards were deliberately ordered some other way.

export type TeaserCard = {
  key: string;
  href: string;
  title: string;
  summary: string;
  /** 16:9 illustration under `/img/<section>/previews/`. Decorative — the title
   * beside it names the page — so it renders `alt=""`. Pages without one get
   * the blank paper panel, which keeps the cards in a row the same height. */
  preview?: string;
  /** Full ISO 8601 publication timestamp. Publication and not the update date:
   * this block is "what's new", and the badge and the dateline should agree
   * with the order the cards are in. */
  published: string;
};

export type TeaserBlock = {
  /** Accent eyebrow over the block — "Estadísticas". */
  label: string;
  /** One line under it, on what the section is for. */
  blurb: string;
  /** Newest first; the first card gets the `NUEVO` badge. */
  cards: TeaserCard[];
  allHref: string;
  allLabel: string;
};

export function SectionTeasers({ blocks }: { blocks: TeaserBlock[] }) {
  return (
    <div className="flex flex-col gap-14">
      {blocks.map((block) => (
        <section key={block.allHref}>
          <div className="flex flex-col items-center gap-2.5 mb-[30px]">
            <Eyebrow tone="accent" className="tracking-label-wide">
              {block.label}
            </Eyebrow>
            <p className="m-0 max-w-[460px] text-center font-mono text-[13.5px] leading-[1.65] text-muted">
              {block.blurb}
            </p>
          </div>

          {/* Three up from `md`, one column below it. No two-column step in
              between: with exactly three cards it always leaves an orphan on
              its own row. */}
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {block.cards.map((card, i) => (
              <TeaserLink key={card.key} card={card} isNew={i === 0} />
            ))}
          </div>

          <div className="mt-7 text-center">
            <Link
              href={block.allHref}
              className="font-mono text-micro uppercase tracking-label text-muted no-underline transition-colors hover:text-accent"
            >
              {block.allLabel} →
            </Link>
          </div>
        </section>
      ))}
    </div>
  );
}

function TeaserLink({ card, isNew }: { card: TeaserCard; isNew: boolean }) {
  return (
    <Link
      href={card.href}
      className="group flex flex-col border border-line bg-card no-underline transition-colors hover:border-accent"
    >
      {card.preview ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={card.preview}
          alt=""
          width={960}
          height={540}
          loading="lazy"
          decoding="async"
          className="w-full aspect-video object-cover border-b border-line bg-paper"
        />
      ) : (
        <div
          aria-hidden="true"
          className="w-full aspect-video border-b border-line paper-grid"
        />
      )}
      <div className="flex flex-col gap-[9px] px-[18px] pt-4 pb-5">
        <div className="flex items-center gap-2">
          {isNew && (
            <span className="flex-none bg-accent text-paper font-mono text-[9.5px] uppercase tracking-[0.14em] leading-none px-1.5 py-[3px]">
              Nuevo
            </span>
          )}
          <span className="font-mono text-micro uppercase tracking-label text-muted">
            {formatContentDateShort(card.published)}
          </span>
        </div>
        <h3 className="m-0 font-display font-semibold text-[18px] tracking-tight leading-tight text-ink transition-colors group-hover:text-accent">
          {card.title}
        </h3>
        <p className="m-0 font-mono text-[12.5px] leading-[1.65] text-muted text-pretty">
          {card.summary}
        </p>
      </div>
    </Link>
  );
}

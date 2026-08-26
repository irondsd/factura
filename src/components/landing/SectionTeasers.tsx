import Link from "next/link";
import { ArticlePreview } from "@/components/article/ArticlePreview";
import { Eyebrow } from "@/components/landing/parts";
import { resolveMediaRefs } from "@/content-system/media/repository";
import type { MediaRef } from "@/content-system/media/repository";
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
// order it is given and badges the FIRST card as new or updated. The distinction
// comes from the page's lifecycle dates; ordering remains the caller's job.

export type TeaserCard = {
  key: string;
  href: string;
  title: string;
  summary: string;
  /** Media-library id of the card's 16:9 illustration. Decorative — the title
   * beside it names the page — so it renders `alt=""`. Pages without one get
   * the blank paper panel, which keeps the cards in a row the same height. */
  previewMediaId?: string;
  /** Full ISO 8601 lifecycle timestamps. Ordering and the visible stamp use the
   * update when it happened after publication, otherwise the publication. */
  published: string;
  updated: string;
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

export async function SectionTeasers({ blocks }: { blocks: TeaserBlock[] }) {
  // Resolve the whole homepage window in one query, just like `/guias` does
  // for its listing rows. Migrated cards no longer have a repository image
  // path, so rendering only `card.preview` would leave them blank.
  const media = await resolveMediaRefs(
    blocks
      .flatMap((block) => block.cards)
      .map((card) => card.previewMediaId)
      .filter((id): id is string => !!id),
  );

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
              <TeaserLink
                key={card.key}
                card={card}
                media={media.get(card.previewMediaId ?? "")}
                isNew={i === 0}
              />
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

function TeaserLink({
  card,
  media,
  isNew,
}: {
  card: TeaserCard;
  media?: MediaRef;
  isNew: boolean;
}) {
  const revised = Date.parse(card.updated) > Date.parse(card.published);
  const activityAt = revised ? card.updated : card.published;

  return (
    <Link
      href={card.href}
      className="group flex flex-col border border-line bg-card no-underline transition-colors hover:border-accent"
    >
      {media ? (
        <ArticlePreview
          media={media}
          className="border-x-0 border-t-0 border-b border-line bg-paper"
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
              {revised ? "Actualizado" : "Nuevo"}
            </span>
          )}
          <span className="font-mono text-micro uppercase tracking-label text-muted">
            {formatContentDateShort(activityAt)}
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

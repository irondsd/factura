import type { AuthorRef } from "@/content-system/authors/types";
import { initials } from "@/lib/format";
import { cn } from "@/lib/cn";

// Who wrote the page and who checked it, between the headline and the dateline.
//
// Every line here is conditional, because every field behind it is: a page may
// have no author, an author may have no job title, no standing line and no
// portrait, and a page with an author may still be unverified. The block
// collapses cleanly at each of those — and disappears entirely, rule included,
// when there is nobody to credit. That is not defensive coding; it is the
// common case today, since credits were only just added and most pages predate
// them.
//
// Names are deliberately not links. `/autores/<slug>` does not exist yet, and a
// byline that navigates nowhere is worse than one that does not offer to.

export function ArticleByline({
  author,
  factChecker,
  className,
}: {
  author?: AuthorRef | null;
  factChecker?: AuthorRef | null;
  className?: string;
}) {
  if (!author && !factChecker) return null;

  return (
    <div className={className}>
      {author && (
        <div
          className={cn(
            "flex gap-3",
            // Centred against a single line, top-aligned against a stack.
            //
            // Not a style preference: with a standing line the text block is
            // 34px against a 35px portrait, so the two look identical on a wide
            // screen — but on a phone the name and job title wrap and the block
            // grows, and centring then drops the portrait to the middle of a
            // three-line paragraph with the name hanging above it.
            author.tagline ? "items-start" : "items-center",
          )}
        >
          <Portrait author={author} />
          <div className="flex flex-col gap-[3px]">
            <p className="m-0 text-[13px] leading-[1.25]">
              <span className="font-medium">{author.name}</span>
              {author.jobTitle && (
                <span className="text-muted"> · {author.jobTitle}</span>
              )}
            </p>
            {author.tagline && (
              <p className="m-0 text-[12px] leading-[1.25] text-muted">
                {author.tagline}
              </p>
            )}
          </div>
        </div>
      )}

      {factChecker && (
        <p
          className={cn(
            "m-0 text-[12px] text-muted",
            // Only spaced off the author block when there is one to space from.
            author && "mt-2.5",
          )}
        >
          Verificado por <span className="text-ink">{factChecker.name}</span>
        </p>
      )}
    </div>
  );
}

/** The portrait, or the initials that stand in for one.
 *
 * A square rather than the design system's round `Avatar`: that circle is "the
 * one round thing in an otherwise square system" and it is spoken for by the
 * claim flows. On a printed-paper article a square photo is the one that
 * belongs.
 *
 * A plain `img` rather than `next/image` because an `AuthorRef` carries a URL
 * and no dimensions, and the box is 35px — there is no layout shift to prevent
 * and nothing to optimize that would pay for the round trip. */
function Portrait({ author }: { author: AuthorRef }) {
  const box =
    "size-[35px] flex-none overflow-hidden border border-line bg-[var(--bone)]";

  if (author.image) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={author.image}
        // Empty on purpose: the name is right beside it in text, so a screen
        // reader that also announced the portrait would say it twice.
        alt=""
        width={35}
        height={35}
        className={cn(box, "object-cover")}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className={cn(
        box,
        "flex items-center justify-center font-mono text-[12px] text-muted",
      )}
    >
      {initials(author.name)}
    </span>
  );
}

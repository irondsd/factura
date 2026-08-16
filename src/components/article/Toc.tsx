"use client";

import { useEffect, useState } from "react";
import type { Heading } from "@/content/headings";
import { cn } from "@/lib/cn";

// An article's table of contents, built from its own `##` headings — see
// `guideHeadings` / `statsHeadings` in the content modules. Two placements of
// the same list: a sticky column beside the article on a wide screen, and a
// collapsed block at the top of the page on a phone. Both are server-rendered
// into the HTML, so the anchors are there for a crawler (and for anyone with JS
// off) either way.
//
// `label` is the heading over the list — "En esta guía" on a guide, "En esta
// página" on a statistics page. The two placements of one page must be given
// the same one; the route passes it once to each.

// Below this the contents is noise: two or three lines that say little more
// than the title already did, in exchange for pushing the article down.
const MIN_SECTIONS = 4;

// Where the "you are here" line sits, in pixels from the top of the viewport.
// Below the 60px sticky header, and low enough that a heading counts as current
// once it has properly arrived rather than the moment it peeks in.
const READING_LINE = 140;

const LINK =
  "block border-l-2 py-1.5 pl-3 font-mono text-[12.5px] leading-[1.45] no-underline transition-colors";

/** The list itself. `active` is the id of the section being read, if known. */
function TocList({
  headings,
  active,
}: {
  headings: Heading[];
  active?: string;
}) {
  return (
    <ol className="m-0 list-none p-0">
      {headings.map((h) => (
        <li key={h.id}>
          <a
            href={`#${h.id}`}
            // `aria-current` only on the real thing: the sticky column tracks
            // the reader, the collapsed mobile block never has an active line.
            aria-current={h.id === active ? "true" : undefined}
            className={cn(
              LINK,
              h.id === active
                ? "border-accent text-accent"
                : "border-line text-muted hover:border-ink/40 hover:text-ink",
            )}
          >
            {h.text}
          </a>
        </li>
      ))}
    </ol>
  );
}

/** Id of the section the reader is currently in: the last heading to have
 * crossed the reading line, or nothing at all while they're still in the intro
 * above the first one — marking a section as current before it has been reached
 * is a small lie the reader can see.
 *
 * Measured from the DOM rather than tracked with an IntersectionObserver
 * because the question — "which heading is the last one above this line" — has
 * an answer at every scroll position, including the ones where no heading is on
 * screen at all. Coalesced to one read per frame, as in `BackToTop`. */
function useActiveHeading(headings: Heading[]): string | undefined {
  const [active, setActive] = useState<string>();

  useEffect(() => {
    let frame = 0;

    const measure = () => {
      frame = 0;
      // The last section is unreachable by scrolling when it's shorter than a
      // viewport — the page runs out first — so the bottom of the document
      // activates it, otherwise it could never light up.
      const atBottom =
        window.scrollY + window.innerHeight >=
        document.documentElement.scrollHeight - 2;
      if (atBottom) {
        setActive(headings.at(-1)?.id);
        return;
      }

      let current: string | undefined;
      for (const h of headings) {
        const top = document.getElementById(h.id)?.getBoundingClientRect().top;
        if (top === undefined || top > READING_LINE) break;
        current = h.id;
      }
      setActive(current);
    };

    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };

    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [headings]);

  return active;
}

/** Stable identity for the no-contents case, so the tracking effect below isn't
 * re-run on every render by a fresh `[]`. */
const NO_HEADINGS: Heading[] = [];

/** The desktop contents: a sticky column in the gutter to the right of the
 * article, which is empty space at these widths anyway. Renders the `<aside>`
 * itself so that an article with too few sections leaves no column behind.
 *
 * `above` heads the column and scrolls away with the page — it's where a
 * guide's preview image goes, and a decorative image has no claim on the
 * viewport for the whole article. `below` rides the sticky list instead and
 * stays put, which is the point of the <AsideCta /> the statistics pages hang
 * there. Either one keeps the column alive on an article with too few sections
 * to list, since a short article has the same empty gutter and the same reason
 * to use it. */
export function TocSidebar({
  headings,
  label,
  above,
  below,
}: {
  headings: Heading[];
  label: string;
  above?: React.ReactNode;
  below?: React.ReactNode;
}) {
  // Split so the scroll tracking is never mounted for an article that shows no
  // contents at all — a hook can't sit behind the early return.
  const listed = headings.length >= MIN_SECTIONS;
  if (!listed && !above && !below) return null;
  return (
    <StickyToc
      headings={listed ? headings : NO_HEADINGS}
      label={label}
      above={above}
      below={below}
    />
  );
}

function StickyToc({
  headings,
  label,
  above,
  below,
}: {
  headings: Heading[];
  label: string;
  above?: React.ReactNode;
  below?: React.ReactNode;
}) {
  const active = useActiveHeading(headings);

  return (
    <aside className="hidden w-[220px] shrink-0 pt-10 lg:block">
      {/* Outside the sticky box below, so it scrolls off the top like the rest
          of the page instead of holding a seventh of the column for the length
          of the article. It also means the list gets the full height back once
          the reader is past it. */}
      {above && <div className="pb-7">{above}</div>}
      {/* Clears the 60px sticky header. A column rather than one scrolling box:
          the list is capped and scrolls on its own (the longest articles run to
          ten sections, taller than a laptop viewport once the header is out of
          the way) while `below` stays pinned under it, which is the whole point
          of putting it here. */}
      <div className="sticky top-[76px] flex max-h-[calc(100vh-100px)] flex-col">
        {headings.length > 0 && (
          <nav aria-labelledby="toc-title" className="min-h-0 overflow-y-auto">
            <p
              id="toc-title"
              className="m-0 mb-3 pl-3 font-mono text-micro uppercase tracking-label-wide text-muted"
            >
              {label}
            </p>
            <TocList headings={headings} active={active} />
          </nav>
        )}
        {below && <div className="flex-none pt-7">{below}</div>}
      </div>
    </aside>
  );
}

/** The mobile contents: a collapsed block above the article. Closed by default
 * — a ten-item list expanded on a phone is most of a screen between the reader
 * and the first paragraph — but the links are in the markup regardless, since
 * `<details>` hides its content rather than dropping it. */
export function TocInline({
  headings,
  label,
}: {
  headings: Heading[];
  label: string;
}) {
  if (headings.length < MIN_SECTIONS) return null;

  return (
    <details className="mt-8 border border-line bg-card lg:hidden [&[open]_.toc-caret]:rotate-180">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 font-mono text-micro uppercase tracking-label-wide text-muted [&::-webkit-details-marker]:hidden">
        {label}
        <svg
          className="toc-caret transition-transform duration-200"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </summary>
      <div className="border-t border-line px-4 py-3">
        <TocList headings={headings} />
      </div>
    </details>
  );
}

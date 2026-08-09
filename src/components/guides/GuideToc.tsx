"use client";

import { useEffect, useState } from "react";
import type { GuideHeading } from "@/content/guias/headings";
import { cn } from "@/lib/cn";

// A guide's table of contents, built from its own `##` headings — see
// `guideHeadings` in content/guias/guides.ts. Two placements of the same list:
// a sticky column beside the article on a wide screen, and a collapsed block at
// the top of the page on a phone. Both are server-rendered into the HTML, so
// the anchors are there for a crawler (and for anyone with JS off) either way.

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
  headings: GuideHeading[];
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
function useActiveHeading(headings: GuideHeading[]): string | undefined {
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

/** The desktop contents: a sticky column in the gutter to the right of the
 * article, which is empty space at these widths anyway. Renders the `<aside>`
 * itself so that a guide with too few sections leaves no column behind. */
export function GuideTocSidebar({ headings }: { headings: GuideHeading[] }) {
  // Split so the scroll tracking is never mounted for a guide that shows no
  // contents at all — a hook can't sit behind the early return.
  if (headings.length < MIN_SECTIONS) return null;
  return <StickyToc headings={headings} />;
}

function StickyToc({ headings }: { headings: GuideHeading[] }) {
  const active = useActiveHeading(headings);

  return (
    <aside className="hidden w-[220px] shrink-0 pt-10 lg:block">
      {/* Clears the 60px sticky header. Capped and scrollable: the longest
          guides run to ten sections, which is taller than a laptop viewport
          once the header is out of the way. */}
      <nav
        aria-labelledby="toc-title"
        className="sticky top-[76px] max-h-[calc(100vh-100px)] overflow-y-auto"
      >
        <p
          id="toc-title"
          className="m-0 mb-3 pl-3 font-mono text-micro uppercase tracking-label-wide text-muted"
        >
          En esta guía
        </p>
        <TocList headings={headings} active={active} />
      </nav>
    </aside>
  );
}

/** The mobile contents: a collapsed block above the article. Closed by default
 * — a ten-item list expanded on a phone is most of a screen between the reader
 * and the first paragraph — but the links are in the markup regardless, since
 * `<details>` hides its content rather than dropping it. */
export function GuideTocInline({ headings }: { headings: GuideHeading[] }) {
  if (headings.length < MIN_SECTIONS) return null;

  return (
    <details className="mt-8 border border-line bg-card lg:hidden [&[open]_.toc-caret]:rotate-180">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 font-mono text-micro uppercase tracking-label-wide text-muted [&::-webkit-details-marker]:hidden">
        En esta guía
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

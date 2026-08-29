import type { ReactNode } from "react";

// The card every statistics and research figure is drawn on.
//
// 61 of the 62 figures in `estadisticas/`, `investigaciones/` and `maps/` open
// with the same `<figure className="fd-card my-8 px-5 pt-5 pb-4">`, and close
// with the same two paragraphs of small print in the same two class strings.
// This is that, named.
//
// ── Which element is the caption ──────────────────────────────────────────
// The corpus had grown two answers. Some figures put the title block in the
// `<figcaption>` at the top and left the descriptive prose as a plain `<p>`;
// others put the title inside the chart or map component and made the prose the
// `<figcaption>`. Three files did both at once, which is invalid: a `<figure>`
// may hold only one `<figcaption>`.
//
// The answer here is the plain reading of the element. **The caption is the
// caption** — the sentence or two under the figure saying what it shows. The
// title is a heading, so it is an `<h3>` in an ordinary `<div>`, which is what
// labels it for anyone navigating by heading and what the contents column
// already links to. One slot, one element, no conditional.
//
// Nothing moves on screen: the header block keeps its classes and its place,
// and the caption keeps its own. What changes is the accessibility tree, where
// a figure's caption is now its description rather than its title.

export function DataFigure({
  header,
  caption,
  note,
  className,
  children,
}: {
  /** The title block above the content: an `<h3>` and an optional line under
   * it. A heading, not a caption — see the note above. */
  header?: { title: ReactNode; subtitle?: ReactNode };
  /** What the figure shows, in a sentence or two, under the content. */
  caption?: ReactNode;
  /** The method small print: how it was measured, what it excludes, the source. */
  note?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <figure className={className ?? "fd-card my-8 px-5 pt-5 pb-4"}>
      {header && (
        <div className="mb-4">
          <h3 className="font-mono text-micro uppercase tracking-label-wide text-muted m-0 scroll-mt-24">
            {header.title}
          </h3>
          {header.subtitle && (
            <p className="font-mono text-xs text-muted mt-1.5 opacity-85 leading-[1.6]">
              {header.subtitle}
            </p>
          )}
        </div>
      )}

      {children}

      {caption && (
        <figcaption className="font-mono text-xs text-muted mt-4 leading-[1.6]">
          {caption}
        </figcaption>
      )}

      {note && (
        <p className="font-mono text-[11.5px] text-muted mt-3 leading-[1.6] opacity-85">
          {note}
        </p>
      )}
    </figure>
  );
}

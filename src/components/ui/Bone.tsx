import { cn } from "@/lib/cn";

/** U+2007 FIGURE SPACE — as wide as a digit in both of the app's families, and
 * not a collapsible white space, so a run of them survives CSS white-space
 * processing and gives a bone a predictable width in any font. */
const FIGURE_SPACE = "\u2007";

/**
 * Skeleton fill standing in for a value that hasn't loaded yet.
 *
 * Two shapes, one look:
 *
 * - A **text bone** (`chars`, or a literal string as `children`) is an inline
 *   span whose text is transparent. Because it's inline, its padding can't grow
 *   the line box — so it occupies exactly the space real text would, and the
 *   swap when the data lands moves nothing around it. Size it in `chars` for
 *   anything whose length is unknown; pass a string only when the real value's
 *   shape is actually known.
 * - A **block bone** (`w`/`h`, no text) covers the things that aren't type:
 *   vendor swatches, a donut ring, a sparkline's slot.
 *
 * Always `aria-hidden`: bones are decoration, and the transparent filler text
 * would otherwise be read aloud. The container holding them announces the wait.
 */
export function Bone({
  chars,
  w,
  h,
  className,
  children,
}: {
  /** Width in digit-widths of the surrounding font. */
  chars?: number;
  /** Block-bone width — a number is px. */
  w?: number | string;
  /** Block-bone height — a number is px. */
  h?: number | string;
  className?: string;
  /** Literal text to size against, for when the real value's shape is known. */
  children?: string;
}) {
  const text = children ?? (chars ? FIGURE_SPACE.repeat(chars) : null);
  return (
    <span
      aria-hidden="true"
      className={cn(
        "fd-bone",
        text ? "fd-bone-text" : "inline-block align-middle",
        className,
      )}
      style={w != null || h != null ? { width: w, height: h } : undefined}
    >
      {text}
    </span>
  );
}

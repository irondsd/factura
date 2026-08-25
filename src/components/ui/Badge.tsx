import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/cn";

export type BadgeTone = "accent" | "neutral";

/** The badge's look, without the element.
 *
 * Exported because a badge is sometimes a link — an article's category flags
 * navigate to their hub — and a `<span>` cannot be one. A caller in that
 * position composes these classes onto its own `<Link>` rather than
 * re-deriving them, which is what keeps a linked badge and a plain one from
 * drifting apart. */
export const badgeClass = (tone: BadgeTone = "accent") =>
  cn(
    "inline-block font-mono text-[10px] uppercase tracking-label border py-0.5 px-1.5 leading-[1.2]",
    tone === "neutral" ? "text-muted border-line" : "text-accent border-accent",
  );

/** Rest props reach the span so a badge whose content is a bare glyph or count
 * can carry the label that makes it mean something (`aria-label`, `title`). */
export function Badge({
  tone = "accent",
  children,
  className,
  ...rest
}: ComponentPropsWithoutRef<"span"> & {
  tone?: BadgeTone;
}) {
  return (
    <span {...rest} className={cn(badgeClass(tone), className)}>
      {children}
    </span>
  );
}

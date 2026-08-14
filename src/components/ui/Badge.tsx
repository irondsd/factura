import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/cn";

/** Rest props reach the span so a badge whose content is a bare glyph or count
 * can carry the label that makes it mean something (`aria-label`, `title`). */
export function Badge({
  tone = "accent",
  children,
  className,
  ...rest
}: ComponentPropsWithoutRef<"span"> & {
  tone?: "accent" | "neutral";
}) {
  return (
    <span
      {...rest}
      className={cn(
        "inline-block font-mono text-[10px] uppercase tracking-label border py-0.5 px-1.5 leading-[1.2]",
        tone === "neutral"
          ? "text-muted border-line"
          : "text-accent border-accent",
        className,
      )}
    >
      {children}
    </span>
  );
}

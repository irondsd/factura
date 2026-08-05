import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

// The base sets the border *width* only. The colour belongs to each variant,
// including the transparent one — `cn` is a plain join, so two border-colour
// utilities on the same element are settled by stylesheet order rather than by
// which was written last, and a `border-transparent` here would silently win
// over any colour a variant or caller adds.
const BTN_BASE =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-none border font-mono text-micro uppercase tracking-label leading-none cursor-pointer transition-colors";
const BTN_SIZES: Record<string, string> = {
  sm: "py-1.5 px-2.5",
  md: "py-2 px-3",
  lg: "py-2.5 px-4 text-xs",
};
const BTN_VARIANTS: Record<string, string> = {
  solid: "bg-ink text-paper border-ink",
  outline:
    "bg-transparent text-ink border-line hover:border-accent hover:text-accent",
  ghost: "bg-transparent text-muted border-transparent hover:text-accent",
  // Wears the accent at rest and fills with it on hover.
  danger:
    "bg-transparent text-accent border-accent hover:bg-accent hover:text-paper",
};

type Variant = "solid" | "outline" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

/** The button's own classes, for the cases that must be a real element other
 * than <button> — a <Link>, chiefly, so the row action can be opened in a new
 * tab. Same escape hatch as `tabClass`. */
export function buttonClass(
  variant: Variant = "outline",
  size: Size = "md",
): string {
  return cn(BTN_BASE, BTN_SIZES[size], BTN_VARIANTS[variant]);
}

export function Button({
  variant = "outline",
  size = "md",
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
}) {
  return (
    <button {...props} className={cn(buttonClass(variant, size), className)}>
      {children}
    </button>
  );
}

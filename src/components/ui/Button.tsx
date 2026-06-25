import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

const BTN_BASE =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-none border border-transparent font-mono text-micro uppercase tracking-label leading-none cursor-pointer transition-colors";
const BTN_SIZES: Record<string, string> = {
  sm: "py-1.5 px-2.5",
  md: "py-2 px-3",
  lg: "py-2.5 px-4 text-xs",
};
const BTN_VARIANTS: Record<string, string> = {
  solid: "bg-ink text-paper border-ink",
  outline:
    "bg-transparent text-ink border-line hover:border-accent hover:text-accent",
  ghost: "bg-transparent text-muted hover:text-accent",
};

export function Button({
  variant = "outline",
  size = "md",
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "solid" | "outline" | "ghost";
  size?: "sm" | "md" | "lg";
}) {
  return (
    <button
      {...props}
      className={cn(
        BTN_BASE,
        BTN_SIZES[size],
        BTN_VARIANTS[variant],
        className,
      )}
    >
      {children}
    </button>
  );
}

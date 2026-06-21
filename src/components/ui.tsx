"use client";

import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
} from "react";
import { cn } from "@/lib/cn";

// Factura's design-system primitives — square corners, mono uppercase labels,
// hairline borders, one accent. Ported from the design bundle.

const BTN_BASE =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-none border border-transparent font-mono text-micro uppercase tracking-label leading-none cursor-pointer transition-colors";
const BTN_SIZES: Record<string, string> = {
  sm: "py-1.5 px-2.5",
  md: "py-2 px-3",
  lg: "py-2.5 px-4 text-xs",
};
const BTN_VARIANTS: Record<string, string> = {
  solid: "bg-ink text-paper border-ink",
  outline: "bg-transparent text-ink border-line hover:border-accent hover:text-accent",
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
      className={cn(BTN_BASE, BTN_SIZES[size], BTN_VARIANTS[variant], className)}
    >
      {children}
    </button>
  );
}

const FIELD_BASE =
  "font-mono text-sm text-ink bg-paper border border-line rounded-none py-2 px-3 outline-none transition-colors box-border focus:border-accent";

export function Input({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(FIELD_BASE, "w-full", className)} />;
}

export function Select({
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...props} className={cn(FIELD_BASE, "cursor-pointer", className)}>
      {children}
    </select>
  );
}

export function Checkbox({
  label,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label?: ReactNode }) {
  return (
    <label
      className={cn(
        "inline-flex items-center gap-2 font-mono text-xs text-ink cursor-pointer",
        className,
      )}
    >
      <input
        type="checkbox"
        {...props}
        className="h-3.5 w-3.5 cursor-pointer accent-accent"
      />
      {label}
    </label>
  );
}

export function Badge({
  tone = "accent",
  children,
  className,
}: {
  tone?: "accent" | "neutral";
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-block font-mono text-[10px] uppercase tracking-label border py-0.5 px-1.5 leading-[1.2]",
        tone === "neutral" ? "text-muted border-line" : "text-accent border-accent",
        className,
      )}
    >
      {children}
    </span>
  );
}

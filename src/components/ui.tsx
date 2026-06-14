"use client";

import type {
  ButtonHTMLAttributes,
  CSSProperties,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
} from "react";

// Factura's design-system primitives — square corners, mono uppercase labels,
// hairline borders, one accent. Ported from the design bundle.

export function Button({
  variant = "outline",
  size = "md",
  style,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "solid" | "outline" | "ghost";
  size?: "sm" | "md" | "lg";
}) {
  const base: CSSProperties = {
    fontFamily: "var(--font-mono)",
    textTransform: "uppercase",
    letterSpacing: "var(--tracking-label)",
    fontSize: "var(--text-micro)",
    lineHeight: 1,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "var(--space-2)",
    cursor: "pointer",
    borderRadius: 0,
    border: "1px solid transparent",
    transition: "var(--transition-colors)",
    whiteSpace: "nowrap",
  };
  const sizes: Record<string, CSSProperties> = {
    sm: { padding: "6px 10px" },
    md: { padding: "8px 12px" },
    lg: { padding: "10px 16px", fontSize: "var(--text-xs)" },
  };
  const variants: Record<string, CSSProperties> = {
    solid: {
      background: "var(--ink)",
      color: "var(--paper)",
      borderColor: "var(--ink)",
    },
    outline: {
      background: "transparent",
      color: "var(--ink)",
      borderColor: "var(--line)",
    },
    ghost: { background: "transparent", color: "var(--muted)" },
  };
  return (
    <button
      {...props}
      className={`fd-btn fd-btn--${variant} ${className ?? ""}`}
      style={{ ...base, ...sizes[size], ...variants[variant], ...style }}
    >
      {children}
    </button>
  );
}

const fieldBase: CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: "var(--text-sm)",
  color: "var(--ink)",
  background: "var(--paper)",
  border: "1px solid var(--line)",
  borderRadius: 0,
  padding: "8px 12px",
  outline: "none",
  transition: "var(--transition-colors)",
  boxSizing: "border-box",
};

export function Input({
  style,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`fd-input ${className ?? ""}`}
      style={{ ...fieldBase, width: "100%", ...style }}
    />
  );
}

export function Select({
  style,
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`fd-input fd-select ${className ?? ""}`}
      style={{ ...fieldBase, cursor: "pointer", ...style }}
    >
      {children}
    </select>
  );
}

export function Checkbox({
  label,
  style,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label?: ReactNode }) {
  return (
    <label
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "var(--space-2)",
        fontFamily: "var(--font-mono)",
        fontSize: "var(--text-xs)",
        color: "var(--ink)",
        cursor: "pointer",
        ...style,
      }}
    >
      <input
        type="checkbox"
        {...props}
        style={{ accentColor: "var(--accent)", width: 14, height: 14, cursor: "pointer" }}
      />
      {label}
    </label>
  );
}

export function Badge({
  tone = "accent",
  children,
  style,
}: {
  tone?: "accent" | "neutral";
  children: ReactNode;
  style?: CSSProperties;
}) {
  const color = tone === "neutral" ? "var(--muted)" : "var(--accent)";
  const border = tone === "neutral" ? "var(--line)" : "var(--accent)";
  return (
    <span
      style={{
        display: "inline-block",
        fontFamily: "var(--font-mono)",
        fontSize: 10,
        textTransform: "uppercase",
        letterSpacing: "var(--tracking-label)",
        color,
        border: `1px solid ${border}`,
        padding: "2px 6px",
        lineHeight: 1.2,
        ...style,
      }}
    >
      {children}
    </span>
  );
}

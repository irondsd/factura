import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

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

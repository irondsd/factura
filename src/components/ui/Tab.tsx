import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Shared class for the square mono tab/pill buttons (active = inverted). Use
 * directly when you need a custom button (key, title, etc.); otherwise <Tab>. */
export function tabClass(active: boolean): string {
  return cn(
    "font-mono text-micro uppercase tracking-[0.1em] py-[5px] px-2.5 cursor-pointer border transition-colors",
    active
      ? "border-ink bg-ink text-paper"
      : "border-line bg-transparent text-muted",
  );
}

export function Tab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button type="button" onClick={onClick} className={tabClass(active)}>
      {children}
    </button>
  );
}

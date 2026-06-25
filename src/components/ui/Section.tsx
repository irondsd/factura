import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** A bordered panel with a mono accent heading and an optional right slot.
 * `dim` greys it out and disables interaction (used for gated steps). */
export function Section({
  title,
  children,
  dim,
  right,
}: {
  title: string;
  children: ReactNode;
  dim?: boolean;
  right?: ReactNode;
}) {
  return (
    <section
      className={cn(
        "border border-line p-4 transition-opacity duration-200",
        dim ? "opacity-55 pointer-events-none" : "opacity-100",
      )}
    >
      <div className="flex items-baseline justify-between gap-2.5 mb-3">
        <h3 className="font-mono text-micro uppercase tracking-label text-accent">
          {title}
        </h3>
        {right}
      </div>
      {children}
    </section>
  );
}

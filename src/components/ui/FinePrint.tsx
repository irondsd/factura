import { cn } from "@/lib/cn";

/** The app's house loading line. `className` positions it for each context. */
export function FinePrint({ className }: { className?: string }) {
  return (
    <p className={cn("font-mono text-[13px] text-muted", className)}>
      Reading the fine print…
    </p>
  );
}

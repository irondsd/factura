import { cn } from "@/lib/cn";

/** A status row: a small square swatch (accent when `ok`) plus a label. */
export function StatusLine({ ok, text }: { ok: boolean; text: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 font-mono text-xs",
        ok ? "text-ink" : "text-muted",
      )}
    >
      <span
        className={cn(
          "w-2 h-2 inline-block flex-none",
          ok ? "bg-accent" : "bg-line",
        )}
      />
      {text}
    </span>
  );
}

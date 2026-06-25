import { cn } from "@/lib/cn";

/** A bordered key/value list — each row a muted label and an ink value, split
 * by dashed hairlines. */
export function RowBox({ rows }: { rows: [string, string][] }) {
  return (
    <div className="border border-line bg-paper">
      {rows.map(([k, v], i) => (
        <div
          key={k}
          className={cn(
            "flex justify-between gap-3 py-[7px] px-3 font-mono text-xs",
            i === 0 ? "" : "border-t border-dashed border-line",
          )}
        >
          <span className="text-muted">{k}</span>
          <span className="text-ink font-medium">{v}</span>
        </div>
      ))}
    </div>
  );
}

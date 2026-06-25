import { cn } from "@/lib/cn";

/** Filter pill used for the vendor tabs on the Bills and Insights screens. The
 * swatch accepts either a tailwind class (`colorClass`, e.g. the `.vbg-*`
 * classes) or a raw color string (`color`). */
export function FilterPill({
  label,
  color,
  colorClass,
  active,
  onClick,
}: {
  label: string;
  color?: string;
  colorClass?: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-[7px] font-mono text-micro uppercase tracking-[0.12em] py-[5px] px-[11px] cursor-pointer border transition-colors",
        active
          ? "border-ink bg-ink text-paper"
          : "border-transparent bg-transparent text-muted",
      )}
    >
      {(color || colorClass) && (
        <span
          className={cn("inline-block w-2 h-2", colorClass)}
          style={color ? { background: color } : undefined}
        />
      )}
      {label}
    </button>
  );
}

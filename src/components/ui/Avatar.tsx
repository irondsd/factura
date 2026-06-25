import { cn } from "@/lib/cn";
import { initials } from "@/lib/format";

/** Avatar circle showing a person's initials. `size` is the px diameter; the
 * text size comes from `className` (the design uses different sizes per spot). */
export function Avatar({
  name,
  size = 30,
  active = false,
  className,
}: {
  name: string;
  size?: number;
  active?: boolean;
  className?: string;
}) {
  return (
    <span
      style={{ width: size, height: size }}
      className={cn(
        "inline-flex flex-none items-center justify-center rounded-full text-paper font-mono font-medium",
        active ? "bg-accent" : "bg-ink",
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}

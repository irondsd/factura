import type { ContentStatus } from "@/content-system/types";
import { cn } from "@/lib/cn";

// One page's lifecycle state, said plainly. The word matters more than the
// colour: an editor deciding whether a change is live should not have to
// remember which shade means what, so each chip names its state and colour only
// reinforces it.

const LABEL: Record<ContentStatus, string> = {
  draft: "Borrador",
  preview: "Vista previa",
  published: "Publicada",
};

const TONE: Record<ContentStatus, string> = {
  draft: "border-line text-muted",
  preview: "border-[var(--vendor-ochre)] text-[var(--vendor-ochre)]",
  published: "border-accent text-accent",
};

export const statusLabel = (status: ContentStatus): string => LABEL[status];

export function StatusChip({
  status,
  className,
}: {
  status: ContentStatus;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-block border px-2 py-px font-mono text-micro uppercase tracking-label-wide",
        TONE[status],
        className,
      )}
    >
      {LABEL[status]}
    </span>
  );
}

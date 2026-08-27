import type { ContentStatus } from "@/content-system/types";
import { cn } from "@/lib/cn";
import { CmsIcon } from "../icons";

// One page's lifecycle state, said plainly. The word matters more than the
// colour: an editor deciding whether a change is live should not have to
// remember which shade means what, so each chip names its state and colour only
// reinforces it.
//
// Deliberately *not* a box. A bordered label the size of a button, sitting in a
// column next to actual buttons, is read as one — «Publicada» and «Nueva
// página» were the same rectangle in the same hue. Shape is the strongest
// signal available, so it carries the distinction: controls are boxed, states
// are not.

const LABEL: Record<ContentStatus, string> = {
  draft: "Borrador",
  preview: "Vista previa",
  published: "Publicada",
};

/** The mark fills in proportion to how public the page is — hollow while it is
 * private, half once it is reachable by anyone holding the link, solid once it
 * is listed. Three states read as one scale that way, rather than as three
 * unrelated words, and it survives being printed or read in greyscale. */
export const STATUS_MARK: Record<ContentStatus, string> = {
  draft: "○",
  preview: "◐",
  published: "●",
};

const TONE: Record<ContentStatus, string> = {
  draft: "text-muted",
  preview: "text-[var(--vendor-ochre)]",
  published: "text-ok",
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
        "inline-flex items-center gap-1.5 whitespace-nowrap font-mono text-micro font-semibold uppercase tracking-label-wide",
        TONE[status],
        className,
      )}
    >
      <span aria-hidden="true">{STATUS_MARK[status]}</span>
      {LABEL[status]}
    </span>
  );
}

/** A page can be published while a newer working copy waits in the CMS. This
 * is intentionally a secondary line rather than a fourth status: the working
 * copy describes an additional saved version, not what readers currently see. */
export function WorkingCopyIndicator() {
  return (
    <span
      title="Hay un borrador de trabajo guardado que todavía no está publicado."
      className="mt-1 inline-flex max-w-full items-center gap-1 whitespace-nowrap font-mono text-[11px] leading-tight text-[var(--vendor-ochre)]"
    >
      <CmsIcon name="workingCopy" size="xs" />
      <span>Borrador guardado</span>
    </span>
  );
}

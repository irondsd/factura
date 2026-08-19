import type { ContentStatus } from "@/content-system/types";
import { formatContentDateTime } from "@/lib/content-date";
import type { HistoryEntry } from "../history";
import { cn } from "@/lib/cn";

// Who changed this page, and when — read top to bottom, newest first.
//
// Vertical rather than horizontal: a page's history is a list that grows
// without bound and every entry is a full sentence, which is the shape a
// column handles and a row does not. The rule down the left is the only
// decoration; the reading order is the timeline.
//
// It is not a revision history. Nothing here can be restored from yet, and the
// panel says so at the bottom rather than implying a "back" that does not
// exist (cms.md Task 2).

/** The node on the rule. Status moves reuse the chip's own scale — hollow while
 * the page is private, half once it has a shareable URL, solid once it is
 * listed — so the timeline and the chip above it are read as the same
 * vocabulary. Edits get a small filled node and creation an open one, which
 * keeps "something changed" visually quieter than "where it went". */
const NODE: Record<ContentStatus, string> = {
  draft: "border-line bg-paper",
  preview: "border-[var(--vendor-ochre)] bg-[var(--vendor-ochre)]",
  published: "border-ok bg-ok",
};

function nodeClass(entry: HistoryEntry): string {
  if (entry.action === "status" && entry.toStatus) return NODE[entry.toStatus];
  if (entry.action === "created") return "border-accent bg-paper";
  // An ordinary edit: filled, but in the muted ink rather than the rule's own
  // colour, which disappeared into the line it sits on.
  return "border-muted bg-muted";
}

export function HistoryPanel({
  entries,
}: {
  entries: readonly HistoryEntry[];
}) {
  if (entries.length === 0) {
    return (
      <p className="font-mono text-[13px] leading-[1.7] text-muted border border-dashed border-line px-5 py-8 text-center">
        Todavía no hay nada registrado para esta página.
      </p>
    );
  }

  return (
    <div>
      <ol className="list-none m-0 p-0 border-l border-line">
        {entries.map((entry) => (
          <li key={entry.key} className="relative pl-6 pb-6 last:pb-0">
            <span
              aria-hidden="true"
              className={cn(
                "absolute left-0 top-[6px] -translate-x-1/2 h-2 w-2 rounded-full border",
                nodeClass(entry),
              )}
            />
            <p className="m-0 text-[14px] leading-[1.5] text-ink">
              <span className="font-semibold">{entry.who}</span> {entry.did}
            </p>
            <p className="mt-1 mb-0 font-mono text-[12px] text-muted">
              <time dateTime={entry.at}>{formatContentDateTime(entry.at)}</time>
              {entry.source === "mcp" && (
                <>
                  {" · "}
                  <span className="text-[var(--vendor-ochre)]">vía agente</span>
                </>
              )}
              {entry.inferred && " · reconstruido de la página"}
            </p>
          </li>
        ))}
      </ol>

      {entries.some((entry) => entry.inferred) && (
        <p className="mt-6 mb-0 font-mono text-[12px] leading-[1.6] text-muted">
          Las líneas marcadas como reconstruidas salen de las fechas de la
          propia página, no del registro: son cambios anteriores a que el
          historial existiera, así que puede haber más de los que se ven.
        </p>
      )}

      <p className="mt-3 mb-0 font-mono text-[12px] leading-[1.6] text-muted">
        El historial guarda quién cambió qué y cuándo, no el texto anterior:
        todavía no se puede volver a una versión pasada.
      </p>
    </div>
  );
}

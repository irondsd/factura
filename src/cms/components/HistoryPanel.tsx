"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import type { ContentSection, ContentStatus } from "@/content-system/types";
import { formatContentDateTime } from "@/lib/content-date";
import { cmsPreviewPath } from "../sections";
import { compareVersionAction } from "../server/actions";
import type { VersionComparison } from "../server/contentService";
import type { HistoryEntry } from "../history";
import {
  type PageVersions,
  type VersionEntry,
  versionHint,
  versionLabel,
} from "../revisions";
import { cn } from "@/lib/cn";
import { CmsModal, DialogCancel } from "./CmsDialog";
import { VersionDiff } from "./VersionDiff";

// The «Historial» tab: the copies of this page that exist, and who has been
// working on it.
//
// Two lists, deliberately, because they answer two different questions
// (cms.md §14.7). The versions are things you can open, compare and restore —
// bounded, at most seven, and every one of them is a document. The activity
// below is a bounded strip of who did what, which is not restorable and never
// claimed to be. Merging them into one timeline was the previous design's
// mistake: it made every save look like a version, and none of them were.
//
// List/detail rather than a stack of expanded documents: seven full articles on
// one screen is not a history, it is a scroll.

export function HistoryPanel({
  section,
  pageId,
  versions,
  entries,
  busy,
  onRestore,
}: {
  section: ContentSection;
  pageId: string;
  versions: PageVersions;
  entries: readonly HistoryEntry[];
  /** True while the editor is mid-mutation. Restoring is a write and shares the
   * page's lock version, so it has to queue behind whatever else is in flight. */
  busy: boolean;
  /** Restore is handled by the editor rather than here: it replaces the working
   * copy, which is the state this panel is a tab of, and a panel that wrote it
   * behind the editor's back would leave the Markdown pane showing the old
   * text. */
  onRestore: (version: VersionEntry) => void;
}) {
  const [comparison, setComparison] = useState<VersionComparison | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const compare = (revisionId: string) => {
    setError(null);
    startTransition(async () => {
      const result = await compareVersionAction({ id: pageId, revisionId });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setComparison(result.data);
    });
  };

  const closeComparison = () => setComparison(null);

  return (
    <div>
      <section aria-labelledby="cms-versions-heading">
        <h2
          id="cms-versions-heading"
          className="font-mono text-micro uppercase tracking-label-wide text-accent border-b border-line pb-2 mb-4 mt-0"
        >
          Versiones guardadas
        </h2>

        {versions.previewIsStale && (
          <p className="border-l-2 border-[var(--vendor-ochre)] pl-4 py-2 font-mono text-[12px] leading-[1.6] text-ink mb-4">
            La vista previa pública es más antigua que el borrador. Quien tenga
            el enlace sigue viendo la copia congelada hasta que la actualices.
          </p>
        )}

        <ul className="list-none m-0 p-0">
          {versions.versions.map((version) => (
            <VersionRow
              key={version.revisionId}
              section={section}
              pageId={pageId}
              version={version}
              baselineRevisionId={versions.baselineRevisionId}
              baselineIsLive={versions.baselineIsLive}
              busy={pending || busy}
              onCompare={() => compare(version.revisionId)}
              onRestore={() => onRestore(version)}
            />
          ))}
        </ul>

        {error && (
          <p
            role="status"
            className="mt-3 mb-0 font-mono text-[12px] text-[var(--vendor-ochre)]"
          >
            {error}
          </p>
        )}

        {/* Said plainly rather than left to be discovered by an editor
            wondering where publication 2 went. */}
        <p className="mt-5 mb-0 font-mono text-[12px] leading-[1.6] text-muted">
          Se guardan la publicación actual y hasta tres anteriores. Al publicar,
          la más antigua se borra y el borrador de trabajo desaparece.
        </p>
      </section>

      <section aria-labelledby="cms-activity-heading" className="mt-9">
        <h2
          id="cms-activity-heading"
          className="font-mono text-micro uppercase tracking-label-wide text-accent border-b border-line pb-2 mb-4"
        >
          Actividad
        </h2>
        <ActivityList entries={entries} />
      </section>

      {comparison && (
        <CmsModal
          eyebrow="Versiones guardadas"
          title="Comparar versiones"
          onClose={closeComparison}
          width="960px"
        >
          <div className="mt-5">
            <VersionDiff comparison={comparison} />
          </div>
          <div className="mt-6 flex">
            <DialogCancel onClick={closeComparison}>Cerrar</DialogCancel>
          </div>
        </CmsModal>
      )}
    </div>
  );
}

/** The node on each version row. The same vocabulary the status chip uses —
 * hollow while private, ochre once it has a shareable URL, solid once readers
 * see it — so the two are read as one system. */
const NODE: Record<VersionEntry["kind"], string> = {
  wip: "border-line bg-paper",
  checkpoint: "border-dashed border-line bg-paper",
  preview: "border-[var(--vendor-ochre)] bg-[var(--vendor-ochre)]",
  published: "border-ok bg-paper",
};

function VersionRow({
  section,
  pageId,
  version,
  baselineRevisionId,
  baselineIsLive,
  busy,
  onCompare,
  onRestore,
}: {
  section: ContentSection;
  pageId: string;
  version: VersionEntry;
  baselineRevisionId: string | null;
  baselineIsLive: boolean;
  busy: boolean;
  onCompare: () => void;
  onRestore: () => void;
}) {
  const hint = versionHint(version);
  // Comparing the baseline with itself is an empty diff dressed up as a
  // question. The button is dropped rather than disabled: there is nothing to
  // explain, and a disabled control invites a hover looking for a reason.
  const comparable =
    baselineRevisionId !== null && baselineRevisionId !== version.revisionId;

  return (
    <li className="border-b border-line py-4 first:pt-0 last:border-b-0">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span
          aria-hidden="true"
          className={cn(
            "inline-block h-2 w-2 shrink-0 self-center rounded-full border",
            NODE[version.kind],
            version.isLive && "bg-ok",
          )}
        />
        <p className="m-0 text-[14px] leading-[1.5] text-ink font-semibold">
          {versionLabel(version)}
        </p>
        {version.isPublicPreview && (
          <span className="font-mono text-micro uppercase tracking-label-wide text-[var(--vendor-ochre)]">
            En la dirección pública
          </span>
        )}
      </div>

      <p className="mt-1 mb-0 font-mono text-[12px] leading-[1.6] text-muted break-words">
        <time dateTime={version.at}>{formatContentDateTime(version.at)}</time>
        {" · "}
        {version.who}
        {" · "}
        {version.title}
      </p>

      {hint && (
        <p className="mt-1 mb-0 font-mono text-[12px] leading-[1.6] text-muted">
          {hint}
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
        <Link
          href={`${cmsPreviewPath(section, pageId)}?revision=${version.revisionId}`}
          target="_blank"
          rel="noreferrer"
          className="font-mono text-micro uppercase tracking-label-wide text-muted no-underline hover:text-accent focus-visible:text-accent"
        >
          Vista previa →
        </Link>
        {comparable && (
          <button
            type="button"
            onClick={onCompare}
            disabled={busy}
            aria-haspopup="dialog"
            className="cursor-pointer border-0 bg-transparent p-0 font-mono text-micro uppercase tracking-label-wide text-muted hover:text-accent focus-visible:text-accent disabled:opacity-45"
          >
            {baselineIsLive
              ? "Comparar con la versión publicada"
              : "Comparar con la última publicada"}
          </button>
        )}
        {version.kind !== "wip" && (
          <button
            type="button"
            onClick={onRestore}
            disabled={busy}
            className="cursor-pointer border-0 bg-transparent p-0 font-mono text-micro uppercase tracking-label-wide text-muted hover:text-accent focus-visible:text-accent disabled:opacity-45"
          >
            Restaurar como borrador
          </button>
        )}
      </div>
    </li>
  );
}

function ActivityList({ entries }: { entries: readonly HistoryEntry[] }) {
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
                activityNode(entry),
              )}
            />
            <p className="m-0 text-[14px] leading-[1.5] text-ink">
              <span className="font-semibold">{entry.who}</span> {entry.did}
              {entry.saveCount > 1 && (
                <span className="text-muted"> ({entry.saveCount} veces)</span>
              )}
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
        La actividad guarda las diez últimas entradas y agrupa los guardados
        seguidos. Para volver a un texto anterior, usa las versiones de arriba.
      </p>
    </div>
  );
}

const STATUS_NODE: Record<ContentStatus, string> = {
  draft: "border-line bg-paper",
  preview: "border-[var(--vendor-ochre)] bg-[var(--vendor-ochre)]",
  published: "border-ok bg-ok",
};

function activityNode(entry: HistoryEntry): string {
  if (entry.action === "status" && entry.toStatus)
    return STATUS_NODE[entry.toStatus];
  if (entry.action === "created") return "border-accent bg-paper";
  if (entry.action === "discarded") return "border-accent bg-paper";
  // An ordinary edit: filled, but in the muted ink rather than the rule's own
  // colour, which disappeared into the line it sits on.
  return "border-muted bg-muted";
}

import type { ContentStatus } from "@/content-system/types";
import type { HistorySource } from "./history";

// The vocabulary of stored versions, shared by the server and the «Historial»
// tab (cms.md §14). Pure: no I/O, no database types, nothing server-only — the
// client renders these labels and the store writes these kinds, and neither
// should own the definition.

/** The four kinds of stored copy. Mirrors `cms_page_revision.kind`.
 *
 * Only `wip` is mutable. `checkpoint`, `preview` and `published` are written
 * once and never updated — which is what makes "the published page did not
 * change while you were editing" a property of the schema rather than a
 * promise. */
export const REVISION_KINDS = [
  "wip",
  "checkpoint",
  "preview",
  "published",
] as const;

export type RevisionKind = (typeof REVISION_KINDS)[number];

export function isRevisionKind(value: string): value is RevisionKind {
  return (REVISION_KINDS as readonly string[]).includes(value);
}

/** Kinds a page may hold at most one of. The database enforces it with partial
 * unique indexes; this is the same fact where the service can read it. */
export const SINGLETON_KINDS = ["wip", "checkpoint", "preview"] as const;

/** How many *superseded* publications a page keeps, on top of the current one
 * (cms.md §14.2). Four `published` rows in total, then.
 *
 * Three because it is the number that answers "undo the last thing, and the
 * thing before it" without turning a CMS into an archive: every retained
 * publication also pins every image it references, and unbounded retention
 * means a media library that can never be cleaned. */
export const RETAINED_PUBLICATIONS = 3;

/** The rolling window a run of saves is compressed into (cms.md §14.5.2).
 *
 * Measured in instants, not calendar days: saving at 23:58 and again at 00:02
 * is one editing session, and a window that reset at midnight would
 * manufacture a checkpoint out of the clock. */
export const CHECKPOINT_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Whether a checkpoint taken at `checkpointAt` is old enough to be replaced by
 * the pre-save WIP. */
export function checkpointIsStale(
  checkpointAt: Date | null,
  now: Date,
): boolean {
  if (!checkpointAt) return true;
  return now.getTime() - checkpointAt.getTime() >= CHECKPOINT_WINDOW_MS;
}

/** One row of the «Historial» tab, in the order the tab renders them.
 *
 * Version-centric rather than event-centric: these are the copies that exist
 * and can be opened, not a log of things that happened. The activity strip is
 * still `cms_page_event`, and it is a separate list for a reason — an event
 * says somebody saved, a version is something you can read. */
export type VersionEntry = {
  revisionId: string;
  kind: RevisionKind;
  /** Non-null only for `published`. */
  publicationNumber: number | null;
  /** The moment this version is filed under: publication time for a
   * publication, last save for the WIP, capture time for a checkpoint. */
  at: string;
  /** Who wrote it, already resolved to something printable. */
  who: string;
  source: HistorySource | null;
  /** True for the revision `cms_page.published_revision_id` points at. */
  isLive: boolean;
  /** True for the revision the public preview URL is currently serving. */
  isPublicPreview: boolean;
  title: string;
};

/** What the whole tab needs: the bounded version list plus the one baseline
 * every comparison runs against. */
export type PageVersions = {
  pageId: string;
  status: ContentStatus;
  versions: VersionEntry[];
  /** The revision comparisons are made against — the live publication, or the
   * last one if the page is not currently published. Null when the page has
   * never been published. */
  baselineRevisionId: string | null;
  /** Whether that baseline is the page's *live* publication. A page in draft
   * or preview has a last publication, and calling it live would be a lie. */
  baselineIsLive: boolean;
  /** True when a public preview exists and the WIP has been saved since. */
  previewIsStale: boolean;
};

/** What to call a version on screen. Spanish, because the CMS is. */
export function versionLabel(entry: VersionEntry): string {
  switch (entry.kind) {
    case "wip":
      return "Borrador de trabajo";
    case "checkpoint":
      return "Antes de esta sesión";
    case "preview":
      return "Vista previa pública";
    case "published":
      return entry.isLive
        ? `Publicación ${entry.publicationNumber} · en línea`
        : `Publicación ${entry.publicationNumber}`;
  }
}

/** One line of explanation under the label, for the kinds whose behaviour is
 * not obvious from their name. */
export function versionHint(entry: VersionEntry): string | null {
  switch (entry.kind) {
    case "wip":
      return "Lo que se guarda al editar. No se ve en el sitio público.";
    case "checkpoint":
      return "Copia automática del borrador anterior a la tanda de guardados en curso. Se reemplaza cada 24 horas y desaparece al publicar.";
    case "preview":
      return "La copia congelada que se sirve en la dirección pública, sin indexar.";
    case "published":
      return null;
  }
}

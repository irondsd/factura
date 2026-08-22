import "server-only";
import { db as defaultDb, type Database } from "@/db";
import { cmsPageRevisions } from "@/db/schema";
import { extractBodyReferences } from "@/content-system/media/references";
import type { MediaPlacement } from "../types";
import { CmsMediaStore, cmsMediaStore, type UsageEntry } from "./store";

// Which revisions use which images, and how that stays true.
//
// `cms_media_usage` is a **cache of a pure function of `cms_page_revision`** —
// that is the definition, and the incremental write on every save is an
// optimization of it (cms.md). Two consequences shape this module:
//
//   * a table maintained only incrementally can never be fully trusted, because
//     a bug in the maintenance path leaves permanent, invisible drift; and
//   * revisions that existed before the library did have no usage rows at all
//     until something re-derives them.
//
// So the rebuild is a first-class operation, not a recovery script, and it runs
// the *same* extractor as the incremental path. One implementation, so the two
// cannot disagree about what a reference is.
//
// The unit of usage is a revision rather than a page, and that is the whole
// point of the change: the third-oldest publication still references the chart
// it was published with, so that chart cannot be trashed while the publication
// is retained — and the moment retention prunes the publication, the foreign
// key's cascade releases the reference in the same transaction. "A retained
// version keeps its images" is then a property of the schema, not a sweep that
// has to remember to run.

/** The metadata field holding a page's preview image. */
const PREVIEW_FIELD = "previewMediaId";

type RevisionContent = {
  id: string;
  bodyMdx: string;
  metadata: unknown;
};

/** The usage rows one revision implies. Pure — give it a body and metadata and
 * it tells you what the table should contain for that copy. */
export function usageEntriesFor(revision: RevisionContent): UsageEntry[] {
  const byKey = new Map<string, UsageEntry>();

  const add = (
    mediaId: string,
    placement: MediaPlacement,
    locator: unknown,
  ) => {
    const key = `${mediaId}:${placement}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.occurrences += 1;
      existing.locators.push(locator);
      return;
    }
    byKey.set(key, {
      mediaId,
      placement,
      occurrences: 1,
      locators: [locator],
    });
  };

  const previewId = previewMediaIdOf(revision.metadata);
  if (previewId) add(previewId, "preview", { field: PREVIEW_FIELD });

  for (const reference of extractBodyReferences(revision.bodyMdx).media) {
    add(reference.mediaId, "body", {
      kind: reference.kind,
      line: reference.line ?? null,
      column: reference.column ?? null,
    });
  }

  return [...byKey.values()];
}

/** The preview media id in a metadata blob, or null. */
export function previewMediaIdOf(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const value = (metadata as Record<string, unknown>)[PREVIEW_FIELD];
  return typeof value === "string" && value ? value.toLowerCase() : null;
}

/** Rewrite one revision's usage rows. Called with a transaction-bound store
 * from the content service, so the copy and its usage move together or not at
 * all. */
export async function writeRevisionUsage(input: {
  store: CmsMediaStore;
  revision: RevisionContent;
  now: Date;
}): Promise<void> {
  await input.store.replaceRevisionUsage({
    revisionId: input.revision.id,
    entries: usageEntriesFor(input.revision),
    now: input.now,
  });
}

export type ReconcileReport = {
  /** Retained revisions scanned — working copies, checkpoints, public previews
   * and publications, not pages. */
  revisionsScanned: number;
  referencesFound: number;
  /** Ids a revision points at that no media row has. A page referencing a
   * purged or never-existent image — a validation failure that reached the
   * database, or a hand-edited body. */
  unresolved: { revisionId: string; mediaId: string }[];
};

/** Re-derive the whole table from every retained revision, in one transaction.
 *
 * At this library's size — tens of pages, at most seven copies each — a full
 * rebuild is milliseconds, so there is no reason to make it incremental and
 * every reason not to: this is the operation that makes drift impossible to
 * persist. Run it on a schedule, from the library's «Recalcular» button, and
 * before any purge sweep.
 *
 * Every kind counts, deliberately. A checkpoint is temporary and a working copy
 * is private, but both still *reference* an image, and an image deleted out
 * from under an editor's unsaved-but-saved draft is exactly the kind of loss
 * this table exists to prevent. */
export async function reconcileMediaUsage(
  db: Database = defaultDb,
  now: Date = new Date(),
): Promise<ReconcileReport> {
  const revisions = await db
    .select({
      id: cmsPageRevisions.id,
      bodyMdx: cmsPageRevisions.bodyMdx,
      metadata: cmsPageRevisions.metadata,
    })
    .from(cmsPageRevisions);

  const known = new Set(
    (await cmsMediaStore.bind(db).allKnownKeys()).map((entry) => entry.id),
  );

  const report: ReconcileReport = {
    revisionsScanned: revisions.length,
    referencesFound: 0,
    unresolved: [],
  };

  const perRevision = revisions.map((revision) => {
    const entries = usageEntriesFor(revision).filter((entry) => {
      if (known.has(entry.mediaId)) return true;
      // Recorded, not written: a foreign key to a row that does not exist would
      // fail the whole rebuild, and one broken page must not stop the other
      // sixty from being reconciled.
      report.unresolved.push({
        revisionId: revision.id,
        mediaId: entry.mediaId,
      });
      return false;
    });
    report.referencesFound += entries.length;
    return { revisionId: revision.id, entries };
  });

  await (db as typeof defaultDb).transaction(async (tx) => {
    const store = cmsMediaStore.bind(tx);
    await store.clearAllUsage();
    for (const revision of perRevision) {
      if (revision.entries.length === 0) continue;
      await store.replaceRevisionUsage({
        revisionId: revision.revisionId,
        entries: revision.entries,
        now,
      });
    }
  });

  return report;
}

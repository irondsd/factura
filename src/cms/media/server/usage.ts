import "server-only";
import { db as defaultDb, type Database } from "@/db";
import { cmsPages } from "@/db/schema";
import { extractBodyReferences } from "@/content-system/media/references";
import type { MediaPlacement } from "../types";
import { CmsMediaStore, cmsMediaStore, type UsageEntry } from "./store";

// Which pages use which images, and how that stays true.
//
// `cms_media_usage` is a **cache of a pure function of `cms_page`** — that is
// the definition, and the incremental write on every save is an optimization of
// it (cms.media.md §3). Two consequences shape this module:
//
//   * a table maintained only incrementally can never be fully trusted, because
//     a bug in the maintenance path leaves permanent, invisible drift; and
//   * pages that existed before the library did have no usage rows at all until
//     something re-derives them.
//
// So the rebuild is a first-class operation, not a recovery script, and it runs
// the *same* extractor as the incremental path. One implementation, so the two
// cannot disagree about what a reference is.

/** The metadata field holding a page's preview image. */
const PREVIEW_FIELD = "previewMediaId";

type PageContent = {
  id: string;
  bodyMdx: string;
  metadata: unknown;
};

/** The usage rows one page implies. Pure — give it a body and metadata and it
 * tells you what the table should contain for that page. */
export function usageEntriesFor(page: PageContent): UsageEntry[] {
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

  const previewId = previewMediaIdOf(page.metadata);
  if (previewId) add(previewId, "preview", { field: PREVIEW_FIELD });

  for (const reference of extractBodyReferences(page.bodyMdx).media) {
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

/** Rewrite one page's usage rows. Called with a transaction-bound store from
 * the content service, so the page and its usage move together or not at all. */
export async function writePageUsage(input: {
  store: CmsMediaStore;
  page: PageContent;
  now: Date;
}): Promise<void> {
  await input.store.replacePageUsage({
    pageId: input.page.id,
    entries: usageEntriesFor(input.page),
    now: input.now,
  });
}

export type ReconcileReport = {
  pagesScanned: number;
  referencesFound: number;
  /** Ids a page points at that no media row has. A page referencing a purged or
   * never-existent image — a validation failure that reached the database, or a
   * hand-edited body. */
  unresolved: { pageId: string; mediaId: string }[];
};

/** Re-derive the whole table from every page, in one transaction.
 *
 * At this library's size — tens of pages — a full rebuild is milliseconds, so
 * there is no reason to make it incremental and every reason not to: this is
 * the operation that makes drift impossible to persist. Run it on a schedule,
 * from the library's «Recalcular» button, and before any purge sweep. */
export async function reconcileMediaUsage(
  db: Database = defaultDb,
  now: Date = new Date(),
): Promise<ReconcileReport> {
  const pages = await db
    .select({
      id: cmsPages.id,
      bodyMdx: cmsPages.bodyMdx,
      metadata: cmsPages.metadata,
    })
    .from(cmsPages);

  const known = new Set(
    (await cmsMediaStore.bind(db).allKnownKeys()).map((entry) => entry.id),
  );

  const report: ReconcileReport = {
    pagesScanned: pages.length,
    referencesFound: 0,
    unresolved: [],
  };

  const perPage = pages.map((page) => {
    const entries = usageEntriesFor(page).filter((entry) => {
      if (known.has(entry.mediaId)) return true;
      // Recorded, not written: a foreign key to a row that does not exist would
      // fail the whole rebuild, and one broken page must not stop the other
      // sixty from being reconciled.
      report.unresolved.push({ pageId: page.id, mediaId: entry.mediaId });
      return false;
    });
    report.referencesFound += entries.length;
    return { pageId: page.id, entries };
  });

  await (db as typeof defaultDb).transaction(async (tx) => {
    const store = cmsMediaStore.bind(tx);
    await store.clearAllUsage();
    for (const page of perPage) {
      if (page.entries.length === 0) continue;
      await store.replacePageUsage({
        pageId: page.pageId,
        entries: page.entries,
        now,
      });
    }
  });

  return report;
}

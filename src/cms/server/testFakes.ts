import { cmsRowToSummary } from "@/content-system/repository/mapping";
import type {
  ContentDocument,
  ContentSection,
  ContentStatus,
  ContentSummary,
  ValidationResult,
} from "@/content-system/types";
import type { HistoryAction } from "../history";
import type { RevisionKind } from "../revisions";
import type { CmsActor } from "../types";
import {
  CmsContentService,
  type ContentValidator,
  type MediaUsageRecorder,
} from "./contentService";
import type { CmsPageEventInsert, CmsPageHistoryStore } from "./historyStore";
import type {
  AuthoredDocument,
  CmsRevisionStore,
  RevisionInsert,
  RevisionRecord,
} from "./revisionStore";
import type { CmsPageInsert, CmsPageRecord, CmsPageStore } from "./store";

// An in-memory `cms_page` + `cms_page_revision` for the unit suites.
//
// Not a mock of the stores' *methods* — a small implementation of what they
// mean. The difference is the whole reason this file exists: a stub that
// returns a fixed document proves the service called something, while this
// proves the service left the right copies behind. Retention, checkpoint
// rotation and pointer movement are all observable here, without a database,
// which is what lets the integration suite stay about SQL and concurrency.
//
// It is deliberately not a general fake. Two things it does not model, and the
// tests that do:
//
//   * **Atomicity.** `transaction` runs its body inline; a rollback is not
//     simulated. `contentService.integration.test.ts` covers that.
//   * **Concurrency.** `updateWithLock` compares versions in JavaScript, which
//     is exactly the read-then-write race the real single UPDATE exists to
//     close. Also the integration suite's job.

export type FakeCms = {
  service: CmsContentService;
  store: CmsPageStore;
  revisions: CmsRevisionStore;
  /** Sections whose public cache the service asked to expire, in order. */
  expired: ContentSection[];
  /** Activity rows the service recorded, in order. */
  events: CmsPageEventInsert[];
  /** Revision ids whose media usage was rewritten, in order. */
  usageWrites: string[];
  /** Move the fake clock. Every timestamp the service writes comes from here. */
  setNow: (now: Date) => void;
  now: () => Date;
  /** Raw access, for asserting on what is stored rather than what is returned. */
  pageRow: (id: string) => CmsPageRecord | undefined;
  revisionRows: (pageId: string) => RevisionRecord[];
  /** The redirect table, as `section:fromSlug → page id`. */
  redirectRows: () => Record<string, string>;
};

let counter = 0;
const nextId = (prefix: string) =>
  `${prefix}-${(counter += 1).toString().padStart(8, "0")}`;

/** `structuredClone`, not a JSON round trip: these rows carry `Date`s, and
 * JSON would hand them back as strings — a fake whose reads differ in type from
 * the real store's is worse than no fake at all. */
const clone = <T>(value: T): T =>
  value === undefined ? value : structuredClone(value);

export function createFakeCms(
  options: {
    validate?: ContentValidator;
    now?: Date;
  } = {},
): FakeCms {
  const pages = new Map<string, CmsPageRecord>();
  const revisions = new Map<string, RevisionRecord>();
  /** The redirect table, keyed `section:fromSlug` → page id — the unique index
   * the real one carries, so a test can catch a rename that would collide. */
  const redirects = new Map<string, string>();
  const expired: ContentSection[] = [];
  const events: CmsPageEventInsert[] = [];
  const usageWrites: string[] = [];
  let now = options.now ?? new Date("2026-02-01T12:00:00.000Z");

  const documentOf = (
    page: CmsPageRecord,
    revision: RevisionRecord,
  ): ContentDocument => ({
    ...cmsRowToSummary(page, revision),
    body: revision.body,
  });

  const cmsRevisionOf = (page: CmsPageRecord): RevisionRecord | undefined => {
    const id =
      page.wipRevisionId ?? page.publishedRevisionId ?? page.previewRevisionId;
    return id ? revisions.get(id) : undefined;
  };

  const publicRevisionOf = (
    page: CmsPageRecord,
  ): RevisionRecord | undefined => {
    const id =
      page.status === "published"
        ? page.publishedRevisionId
        : page.status === "preview"
          ? page.previewRevisionId
          : null;
    return id ? revisions.get(id) : undefined;
  };

  const summaryOf = (page: CmsPageRecord): ContentSummary | null => {
    const revision = cmsRevisionOf(page);
    return revision ? cmsRowToSummary(page, revision) : null;
  };

  const revisionStore = {
    bind: () => revisionStore,
    byId: async (id: string) => clone(revisions.get(id)) ?? null,
    byIds: async (ids: readonly string[]) =>
      ids.flatMap((id) => {
        const row = revisions.get(id);
        return row ? [clone(row)] : [];
      }),
    listForPage: async (pageId: string) =>
      [...revisions.values()]
        .filter((revision) => revision.pageId === pageId)
        .map(clone),
    publications: async (pageId: string) =>
      [...revisions.values()]
        .filter(
          (revision) =>
            revision.pageId === pageId && revision.kind === "published",
        )
        .sort((a, b) => (b.publicationNumber ?? 0) - (a.publicationNumber ?? 0))
        .map(clone),
    nextPublicationNumber: async (pageId: string) =>
      [...revisions.values()]
        .filter((revision) => revision.pageId === pageId)
        .reduce(
          (max, revision) => Math.max(max, revision.publicationNumber ?? 0),
          0,
        ) + 1,
    insert: async (input: RevisionInsert) => {
      // The partial unique indexes, in JavaScript. Without them the fake would
      // happily hold two working copies and the tests that prove there is only
      // ever one would pass against a model that does not enforce it.
      if (input.kind !== "published") {
        const duplicate = [...revisions.values()].some(
          (revision) =>
            revision.pageId === input.pageId && revision.kind === input.kind,
        );
        if (duplicate) {
          throw new Error(
            `unique violation: ${input.pageId} already has a ${input.kind} revision`,
          );
        }
      }
      const row: RevisionRecord = {
        id: nextId("rev"),
        pageId: input.pageId,
        kind: input.kind,
        basedOnRevisionId: input.basedOnRevisionId ?? null,
        publicationNumber: input.publicationNumber ?? null,
        ...clone(input.document),
        contentUpdatedAt: input.document.contentUpdatedAt,
        createdBy: input.createdBy ?? input.actorId,
        updatedBy: input.actorId,
        createdAt: input.now,
        updatedAt: input.now,
        publishedAt: input.publishedAt ?? null,
      };
      revisions.set(row.id, row);
      return clone(row);
    },
    updateWip: async (input: {
      id: string;
      document: AuthoredDocument;
      basedOnRevisionId?: string | null;
      actorId: string | null;
      now: Date;
    }) => {
      const row = revisions.get(input.id);
      if (!row || row.kind !== "wip") return null;
      const next: RevisionRecord = {
        ...row,
        ...clone(input.document),
        contentUpdatedAt: input.document.contentUpdatedAt,
        ...(input.basedOnRevisionId !== undefined
          ? { basedOnRevisionId: input.basedOnRevisionId }
          : {}),
        updatedBy: input.actorId,
        updatedAt: input.now,
      };
      revisions.set(next.id, next);
      return clone(next);
    },
    deleteMany: async (ids: readonly string[]) => {
      for (const id of ids) {
        // The `restrict` foreign keys, in JavaScript: deleting a revision a
        // page still names is the bug this fake has to be able to catch.
        const pointed = [...pages.values()].find((page) =>
          [
            page.publishedRevisionId,
            page.previewRevisionId,
            page.wipRevisionId,
            page.checkpointRevisionId,
          ].includes(id),
        );
        if (pointed) {
          throw new Error(
            `restrict violation: revision ${id} is still pointed at by page ${pointed.id}`,
          );
        }
        revisions.delete(id);
      }
    },
    allRevisions: async () => [...revisions.values()].map(clone),
  };

  const pageStore = {
    transaction: async <T>(
      body: (store: unknown, tx: unknown) => Promise<T>,
    ): Promise<T> => body(pageStore, null),

    findPage: async (id: string) => clone(pages.get(id)) ?? null,

    findPageBySlug: async (section: ContentSection, slug: string) =>
      clone(
        [...pages.values()].find(
          (page) => page.section === section && page.slug === slug,
        ),
      ) ?? null,

    findById: async (id: string) => {
      const page = pages.get(id);
      if (!page) return null;
      const revision = cmsRevisionOf(page);
      return revision ? documentOf(page, revision) : null;
    },

    findBySlug: async (section: ContentSection, slug: string) => {
      const page = [...pages.values()].find(
        (candidate) => candidate.section === section && candidate.slug === slug,
      );
      if (!page) return null;
      const revision = cmsRevisionOf(page);
      return revision ? documentOf(page, revision) : null;
    },

    findAtRevision: async (pageId: string, revisionId: string) => {
      const page = pages.get(pageId);
      const revision = revisions.get(revisionId);
      if (!page || !revision || revision.pageId !== pageId) return null;
      return documentOf(page, revision);
    },

    list: async (filter: { section?: ContentSection } = {}) =>
      [...pages.values()]
        .filter((page) => !filter.section || page.section === filter.section)
        .flatMap((page) => {
          const summary = summaryOf(page);
          return summary ? [summary] : [];
        })
        .sort(
          (a, b) => a.sortOrder - b.sortOrder || a.slug.localeCompare(b.slug),
        ),

    documentsForSection: async (section: ContentSection) =>
      [...pages.values()]
        .filter((page) => page.section === section)
        .flatMap((page) => {
          const revision = cmsRevisionOf(page);
          return revision ? [documentOf(page, revision)] : [];
        }),

    publicDocumentsForSection: async (section: ContentSection) =>
      [...pages.values()]
        .filter((page) => page.section === section)
        .flatMap((page) => {
          const revision = publicRevisionOf(page);
          return revision ? [documentOf(page, revision)] : [];
        }),

    insertPage: async (input: CmsPageInsert) => {
      const row: CmsPageRecord = {
        id: nextId("page"),
        section: input.section,
        slug: input.slug,
        status: input.status,
        publishedAt: null,
        createdAt: input.now,
        createdBy: input.actorId,
        updatedAt: input.now,
        updatedBy: input.actorId,
        lockVersion: 1,
        publishedRevisionId: null,
        previewRevisionId: null,
        wipRevisionId: null,
        checkpointRevisionId: null,
      };
      pages.set(row.id, row);
      return clone(row);
    },

    updateWithLock: async (input: {
      id: string;
      expectedLockVersion: number;
      actorId: string;
      now: Date;
      patch: Partial<CmsPageRecord> & { status?: ContentStatus };
    }) => {
      const row = pages.get(input.id);
      if (!row || row.lockVersion !== input.expectedLockVersion) return null;
      const next: CmsPageRecord = {
        ...row,
        ...input.patch,
        lockVersion: row.lockVersion + 1,
        updatedBy: input.actorId,
        updatedAt: input.now,
      };
      pages.set(next.id, next);
      return clone(next);
    },

    setPointers: async (input: {
      id: string;
      patch: Partial<
        Pick<
          CmsPageRecord,
          | "publishedRevisionId"
          | "previewRevisionId"
          | "wipRevisionId"
          | "checkpointRevisionId"
        >
      >;
    }) => {
      const row = pages.get(input.id);
      if (!row) return;
      pages.set(input.id, { ...row, ...input.patch });
    },

    moveSlug: async (input: {
      id: string;
      slug: string;
      actorId: string;
      now: Date;
    }) => {
      const row = pages.get(input.id);
      if (!row) return;
      pages.set(input.id, {
        ...row,
        slug: input.slug,
        lockVersion: row.lockVersion + 1,
        updatedBy: input.actorId,
        updatedAt: input.now,
      });
    },

    addRedirects: async (input: {
      section: ContentSection;
      slugs: readonly string[];
      pageId: string;
    }) => {
      for (const slug of input.slugs) {
        redirects.set(`${input.section}:${slug}`, input.pageId);
      }
    },

    dropRedirects: async (
      section: ContentSection,
      slugs: readonly string[],
    ) => {
      for (const slug of slugs) redirects.delete(`${section}:${slug}`);
    },

    redirectsForPage: async (pageId: string) =>
      [...redirects.entries()]
        .filter(([, id]) => id === pageId)
        .map(([key]) => key.slice(key.indexOf(":") + 1)),

    deleteById: async (id: string) => {
      pages.delete(id);
      for (const [revisionId, revision] of revisions) {
        if (revision.pageId === id) revisions.delete(revisionId);
      }
    },

    lockVersionOf: async (id: string) => pages.get(id)?.lockVersion ?? null,

    pagesWithParent: async (pageId: string) =>
      [
        ...new Set(
          [...revisions.values()]
            .filter(
              (revision) =>
                revision.parentId === pageId && revision.pageId !== pageId,
            )
            .map((revision) => revision.pageId),
        ),
      ].map((id) => ({ id, slug: pages.get(id)?.slug ?? "" })),

    pagesForRevisions: async (ids: readonly string[]) =>
      new Map(
        ids.flatMap((id) => {
          const revision = revisions.get(id);
          const page = revision ? pages.get(revision.pageId) : undefined;
          return page ? ([[id, clone(page)]] as [string, CmsPageRecord][]) : [];
        }),
      ),
  };

  const historyStore = {
    record: async (input: CmsPageEventInsert) => {
      events.push(input);
    },
    listForPage: async () => [],
    actorsById: async (ids: readonly string[]) =>
      new Map(
        [...new Set(ids)].map((id) => [
          id,
          { id, name: "Editora de prueba", email: "editor@example.com" },
        ]),
      ),
  };

  const recordMediaUsage: MediaUsageRecorder = async ({ revision }) => {
    usageWrites.push(revision.id);
  };

  const permissive: ContentValidator = (): ValidationResult => ({
    ok: true,
    diagnostics: [],
  });

  const service = new CmsContentService(
    options.validate ?? permissive,
    pageStore as unknown as CmsPageStore,
    revisionStore as unknown as CmsRevisionStore,
    historyStore as unknown as CmsPageHistoryStore,
    () => now,
    (section) => expired.push(section),
    recordMediaUsage,
  );

  return {
    service,
    store: pageStore as unknown as CmsPageStore,
    revisions: revisionStore as unknown as CmsRevisionStore,
    expired,
    events,
    usageWrites,
    setNow: (next: Date) => {
      now = next;
    },
    now: () => now,
    pageRow: (id: string) => clone(pages.get(id)),
    revisionRows: (pageId: string) =>
      [...revisions.values()]
        .filter((revision) => revision.pageId === pageId)
        .map(clone),
    redirectRows: () => Object.fromEntries(redirects),
  };
}

/** A page created through the service, with the fields every suite repeats. */
export async function seedPage(
  fake: FakeCms,
  actor: CmsActor,
  overrides: Partial<{
    section: ContentSection;
    slug: string;
    title: string;
    body: string;
  }> = {},
): Promise<ContentDocument> {
  return fake.service.create(actor, {
    section: overrides.section ?? "guias",
    slug: overrides.slug ?? "una-guia",
    title: overrides.title ?? "Una guía",
    description: "Descripción de prueba para la suite del CMS.",
    summary: "Resumen de prueba.",
    cta: "Probá Factura.",
    body: overrides.body ?? "Cuerpo de prueba.\n",
    metadata: { keywords: ["prueba"], categories: ["servicios"] },
  });
}

/** Which kinds of revision a page holds, sorted, for a one-line assertion. */
export const kindsOf = (fake: FakeCms, pageId: string): RevisionKind[] =>
  fake
    .revisionRows(pageId)
    .map((revision) => revision.kind)
    .sort();

/** The activity actions recorded, in order. */
export const actionsOf = (fake: FakeCms): HistoryAction[] =>
  fake.events.map((event) => event.action);

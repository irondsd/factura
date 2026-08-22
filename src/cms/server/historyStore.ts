import "server-only";
import { and, desc, eq, gte, inArray, ne, notInArray, sql } from "drizzle-orm";
import { db as defaultDb, type Database } from "@/db";
import { cmsPageEvents, users } from "@/db/schema";
import type { ContentStatus } from "@/content-system/types";
import {
  type CmsPageEvent,
  type HistoryAction,
  type HistoryActor,
  type HistorySource,
  isHistoryAction,
} from "../history";

// The only module that reads or writes `cms_page_event`.
//
// Same shape as `./store`: dumb SQL under a service that decides whether a
// write happens at all. Recording is best-effort by contract — see
// `CmsContentService.record` — so nothing here throws on the caller's behalf.
//
// The one piece of policy that lives here rather than above is retention, and
// it is here because it is inseparable from the insert: coalescing decides
// whether there *is* an insert, and the prune has to run on the same rows in
// the same statement sequence. cms.md bounds both.

/** How long a run of saves keeps folding into one activity row. */
const ACTIVITY_WINDOW_MS = 24 * 60 * 60 * 1000;

/** How many activity rows a page keeps, creation included. */
const ACTIVITY_LIMIT = 10;

/** The id of a page's newest activity row, as a scalar subquery. */
const NEWEST_EVENT_ID = (pageId: string) =>
  sql`(select id from cms_page_event where page_id = ${pageId} order by created_at desc, id desc limit 1)`;

export type CmsPageEventInsert = {
  pageId: string;
  actorId: string;
  action: HistoryAction;
  fromStatus?: ContentStatus | null;
  toStatus?: ContentStatus | null;
  source: HistorySource;
  now: Date;
};

export class CmsPageHistoryStore {
  constructor(private readonly db: Database = defaultDb) {}

  /** Record one accepted mutation, coalescing runs of saves and keeping the
   * page's activity bounded (cms.md).
   *
   * Two rules, and both exist because this list is read by a person:
   *
   *   * **A run of saves is one line.** Ten saves in an hour is one editing
   *     session, and a timeline that renders it as ten entries is a timeline
   *     nobody scrolls to the interesting part of. Same page, same actor, same
   *     source, inside a rolling 24 hours: the row is updated rather than
   *     inserted, and it says how many saves it stands for.
   *   * **Ten rows per page, ever.** Recoverable history is
   *     `cms_page_revision`, which is bounded by retention; this is the
   *     activity strip beside it, and an unbounded one would be both a
   *     scrolling problem and a table that grows without a ceiling. */
  async record(input: CmsPageEventInsert): Promise<void> {
    const coalesced =
      input.action === "saved" ? await this.coalesceSave(input) : false;
    if (!coalesced) {
      await this.db.insert(cmsPageEvents).values({
        pageId: input.pageId,
        actorId: input.actorId,
        action: input.action,
        fromStatus: input.fromStatus ?? null,
        toStatus: input.toStatus ?? null,
        source: input.source,
        saveCount: 1,
        firstAt: input.now,
        createdAt: input.now,
      });
    }
    await this.prune(input.pageId);
  }

  /** Fold this save into the open one, if there is one. `false` means there was
   * nothing to fold into and the caller should insert.
   *
   * The window is rolling and measured in instants, exactly like the WIP
   * checkpoint's: a save at 23:58 and one at 00:02 are the same session, and a
   * window that reset at midnight would split them for no reason a reader
   * would recognise. */
  private async coalesceSave(input: CmsPageEventInsert): Promise<boolean> {
    const since = new Date(input.now.getTime() - ACTIVITY_WINDOW_MS);
    const rows = await this.db
      .update(cmsPageEvents)
      .set({
        saveCount: sql`${cmsPageEvents.saveCount} + 1`,
        // `first_at` is null on rows written before it existed; the row's own
        // `created_at` is the best answer for when that run began.
        firstAt: sql`coalesce(${cmsPageEvents.firstAt}, ${cmsPageEvents.createdAt})`,
        createdAt: input.now,
      })
      .where(
        and(
          eq(cmsPageEvents.pageId, input.pageId),
          eq(cmsPageEvents.action, "saved"),
          eq(cmsPageEvents.actorId, input.actorId),
          eq(cmsPageEvents.source, input.source),
          gte(cmsPageEvents.createdAt, since),
          // Only the newest row for this page may absorb a save. Without it a
          // save would fold into an old run that a publication has since been
          // recorded after, and the timeline would show the edit as having
          // happened before the publication it followed.
          eq(cmsPageEvents.id, NEWEST_EVENT_ID(input.pageId)),
        ),
      )
      .returning({ id: cmsPageEvents.id });
    return rows.length > 0;
  }

  /** Keep the newest `ACTIVITY_LIMIT` rows, plus the creation event.
   *
   * Creation survives for as long as the page does: "who made this and when" is
   * the one question the strip is asked about pages nobody has touched in a
   * year, and it is the entry that would always be the first to age out. If
   * keeping it would make eleven, the oldest of the others goes instead. */
  private async prune(pageId: string): Promise<void> {
    const keep = this.db
      .select({ id: cmsPageEvents.id })
      .from(cmsPageEvents)
      .where(
        and(
          eq(cmsPageEvents.pageId, pageId),
          ne(cmsPageEvents.action, "created"),
        ),
      )
      .orderBy(desc(cmsPageEvents.createdAt), desc(cmsPageEvents.id))
      .limit(ACTIVITY_LIMIT - 1);
    const survivors = (await keep).map((row) => row.id);

    await this.db
      .delete(cmsPageEvents)
      .where(
        and(
          eq(cmsPageEvents.pageId, pageId),
          ne(cmsPageEvents.action, "created"),
          survivors.length > 0
            ? notInArray(cmsPageEvents.id, survivors)
            : undefined,
        ),
      );
  }

  /** One page's history, newest first, with each actor resolved to a name.
   *
   * A left join, not an inner one: an account can be deleted after it edited a
   * page, and losing those rows would silently rewrite the history rather than
   * showing the edit with an unknown author. */
  async listForPage(pageId: string): Promise<CmsPageEvent[]> {
    const rows = await this.db
      .select({
        id: cmsPageEvents.id,
        action: cmsPageEvents.action,
        fromStatus: cmsPageEvents.fromStatus,
        toStatus: cmsPageEvents.toStatus,
        source: cmsPageEvents.source,
        saveCount: cmsPageEvents.saveCount,
        firstAt: cmsPageEvents.firstAt,
        createdAt: cmsPageEvents.createdAt,
        actorId: cmsPageEvents.actorId,
        actorName: users.name,
        actorEmail: users.email,
      })
      .from(cmsPageEvents)
      .leftJoin(users, eq(users.id, cmsPageEvents.actorId))
      .where(eq(cmsPageEvents.pageId, pageId))
      .orderBy(desc(cmsPageEvents.createdAt));

    return rows.map((row) => ({
      id: row.id,
      // A row whose `action` is not one this build knows is a row from a newer
      // deploy, not a reason to fail the tab: it is shown as an ordinary edit.
      action: isHistoryAction(row.action) ? row.action : "saved",
      fromStatus: row.fromStatus,
      toStatus: row.toStatus,
      source: row.source === "mcp" ? "mcp" : "browser",
      saveCount: row.saveCount,
      firstAt: row.firstAt ? row.firstAt.toISOString() : null,
      at: row.createdAt.toISOString(),
      actor: row.actorId
        ? { id: row.actorId, name: row.actorName, email: row.actorEmail }
        : null,
    }));
  }

  /** The accounts behind a page's `created_by` / `updated_by`, for the entries
   * `buildHistory` reconstructs when a page predates the event table. */
  async actorsById(ids: readonly string[]): Promise<Map<string, HistoryActor>> {
    const wanted = [...new Set(ids)];
    if (wanted.length === 0) return new Map();
    const rows = await this.db
      .select({ id: users.id, name: users.name, email: users.email })
      .from(users)
      .where(inArray(users.id, wanted));
    return new Map(rows.map((row) => [row.id, row]));
  }
}

export const cmsPageHistoryStore = new CmsPageHistoryStore();

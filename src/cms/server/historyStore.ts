import "server-only";
import { desc, eq, inArray } from "drizzle-orm";
import { db as defaultDb, type Database } from "@/db";
import { cmsPageEvents, users } from "@/db/schema";
import type { ContentStatus } from "@/content-system/types";
import {
  type CmsPageEvent,
  type HistoryActor,
  type HistorySource,
  isHistoryAction,
} from "../history";

// The only module that reads or writes `cms_page_event`.
//
// Same shape as `./store`: dumb SQL under a service that decides whether a
// write happens at all. Recording is best-effort by contract — see
// `CmsContentService.record` — so nothing here throws on the caller's behalf.

export type CmsPageEventInsert = {
  pageId: string;
  actorId: string;
  action: "created" | "saved" | "status";
  fromStatus?: ContentStatus | null;
  toStatus?: ContentStatus | null;
  source: HistorySource;
  now: Date;
};

export class CmsPageHistoryStore {
  constructor(private readonly db: Database = defaultDb) {}

  async record(input: CmsPageEventInsert): Promise<void> {
    await this.db.insert(cmsPageEvents).values({
      pageId: input.pageId,
      actorId: input.actorId,
      action: input.action,
      fromStatus: input.fromStatus ?? null,
      toStatus: input.toStatus ?? null,
      source: input.source,
      createdAt: input.now,
    });
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

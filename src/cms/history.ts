import type { ContentStatus } from "@/content-system/types";

// What the «Historia» tab shows: who changed a page and when.
//
// Pure, and shared by the server loader and the client tab — the wording of an
// entry is the same question wherever it is asked, and it is the part worth
// testing. Marks and colour stay in the component; this module decides *what
// happened*, not what it looks like.
//
// One page's history is a list of accepted mutations, newest first. It is not a
// revision history: no body is kept yet, so nothing here can be restored from.
// cms.md Task 2 adds one previous version, and it hangs off these same rows.

/** The kinds of change recorded. Mirrors `cms_page_event.action`. */
export const HISTORY_ACTIONS = ["created", "saved", "status"] as const;

export type HistoryAction = (typeof HISTORY_ACTIONS)[number];

export function isHistoryAction(value: string): value is HistoryAction {
  return (HISTORY_ACTIONS as readonly string[]).includes(value);
}

/** Whether a person or an agent holding a CMS token made the change. */
export type HistorySource = "browser" | "mcp";

/** Who made a change, as far as the database still knows. Null when the
 * account was deleted — `cms_page_event.actor_id` degrades to null rather than
 * blocking the deletion. */
export type HistoryActor = {
  id: string;
  name: string | null;
  email: string | null;
};

/** One stored row, already joined to its actor. */
export type CmsPageEvent = {
  id: string;
  action: HistoryAction;
  fromStatus: ContentStatus | null;
  toStatus: ContentStatus | null;
  source: HistorySource;
  /** ISO 8601, like every other timestamp crossing the server/client line. */
  at: string;
  actor: HistoryActor | null;
};

/** One line of the timeline, ready to render. */
export type HistoryEntry = {
  key: string;
  action: HistoryAction;
  /** The state the page was left in, when the entry is a lifecycle move. */
  toStatus: ContentStatus | null;
  /** Who, in the words to put on screen. */
  who: string;
  /** What they did, in the words to put on screen. */
  did: string;
  at: string;
  /** Null on an inferred entry: the page columns say when a change happened
   * and who wrote it, never through what. */
  source: HistorySource | null;
  /** True for an entry reconstructed from the page's own `created_at` /
   * `updated_at` columns rather than read from a recorded event — every page
   * that existed before this table did. Said on screen, because "one edit ever"
   * and "we only know about one edit" are different claims. */
  inferred: boolean;
};

/** The page columns the fallback is built from, plus the actors behind them. */
export type HistoryFallback = {
  createdAt: string;
  updatedAt: string;
  createdBy: HistoryActor | null;
  updatedBy: HistoryActor | null;
};

const ANONYMOUS = "Cuenta eliminada";

/** The actor's display name. Falls back to the email, which every account has,
 * and then to a plain statement that the account is gone — never to a bare
 * UUID, which tells the reader nothing they can act on. */
export function actorLabel(actor: HistoryActor | null): string {
  if (!actor) return ANONYMOUS;
  return actor.name?.trim() || actor.email?.trim() || ANONYMOUS;
}

/** What an event says, in the past tense and in the words an editor uses. */
export function describeEvent(event: {
  action: HistoryAction;
  fromStatus: ContentStatus | null;
  toStatus: ContentStatus | null;
}): string {
  if (event.action === "created") return "creó la página";
  if (event.action === "saved") return "guardó cambios";
  if (event.toStatus === "published") return "publicó la página";
  if (event.toStatus === "preview") return "puso la página en vista previa";
  if (event.toStatus === "draft") {
    // Both roads lead to `draft`, and they are not the same event: one takes a
    // live page off the public site, the other walks a preview back.
    return event.fromStatus === "published"
      ? "despublicó la página"
      : "volvió la página a borrador";
  }
  return "cambió el estado de la página";
}

/** The timeline for one page: recorded events newest first, with the page's own
 * timestamps filling in whatever the record does not cover.
 *
 * Two gaps get filled, and only those:
 *
 *  - **No creation event.** Every page created before this table existed has
 *    one, so the timeline would otherwise start mid-story or empty.
 *  - **No events at all, but the row has been edited since.** `updated_at`
 *    proves an edit happened and `updated_by` says by whom; dropping that on
 *    the floor would show a page as untouched since creation when it is not.
 *
 * Nothing is invented beyond that: a page with recorded events shows exactly
 * those, plus its creation. */
export function buildHistory(input: {
  events: readonly CmsPageEvent[];
  fallback: HistoryFallback;
}): HistoryEntry[] {
  const { fallback } = input;
  const events = [...input.events].sort((a, b) => b.at.localeCompare(a.at));

  const entries: HistoryEntry[] = events.map((event) => ({
    key: event.id,
    action: event.action,
    toStatus: event.toStatus,
    who: actorLabel(event.actor),
    did: describeEvent(event),
    at: event.at,
    source: event.source,
    inferred: false,
  }));

  if (events.length === 0 && fallback.updatedAt > fallback.createdAt) {
    entries.push({
      key: "inferred-updated",
      action: "saved",
      toStatus: null,
      who: actorLabel(fallback.updatedBy),
      // Not "guardó cambios": all `updated_at` proves is that the row was
      // written, and a status flip writes it too.
      did: "hizo la última edición",
      at: fallback.updatedAt,
      source: null,
      inferred: true,
    });
  }

  if (!events.some((event) => event.action === "created")) {
    entries.push({
      key: "inferred-created",
      action: "created",
      toStatus: null,
      who: actorLabel(fallback.createdBy),
      did: "creó la página",
      at: fallback.createdAt,
      source: null,
      inferred: true,
    });
  }

  return entries;
}

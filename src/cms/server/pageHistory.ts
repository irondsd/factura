import "server-only";
import type { ContentDocument } from "@/content-system/types";
import { buildHistory, type HistoryEntry } from "../history";
import {
  CmsPageHistoryStore,
  cmsPageHistoryStore as defaultStore,
} from "./historyStore";

/** The «Historial» tab's activity strip: recorded events for this page, plus
 * the entries reconstructed from its own columns when the record does not reach
 * back far enough (`buildHistory` decides which).
 *
 * The extra `users` lookup only happens when it is needed — a page created
 * since the event table exists has a real creation event and never asks. */
export async function loadPageHistory(
  page: ContentDocument,
  store: CmsPageHistoryStore = defaultStore,
): Promise<HistoryEntry[]> {
  const events = await store.listForPage(page.id);

  const needsFallback = !events.some((event) => event.action === "created");
  const actors = needsFallback
    ? await store.actorsById(
        [page.createdBy, page.updatedBy].filter((id): id is string => !!id),
      )
    : new Map();

  return buildHistory({
    events,
    fallback: {
      createdAt: page.createdAt,
      updatedAt: page.updatedAt,
      createdBy: (page.createdBy && actors.get(page.createdBy)) || null,
      updatedBy: (page.updatedBy && actors.get(page.updatedBy)) || null,
    },
  });
}

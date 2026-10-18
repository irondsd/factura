import "server-only";
import { revalidateTag } from "next/cache";
import {
  RAIL_SECTIONS,
  type RailCandidate,
  railSignatures,
} from "@/content-system/document";
import { publicContentRepository } from "@/content-system/repository/public";
import { contentRailTag } from "@/content-system/repository/tags";
import type { ContentSection } from "@/content-system/types";

// Refreshing the related rails a write actually moved (cms.md).
//
// Every guide shows three related guides, ranked out of every published guide
// in the section. Tagging each article with the section made that correct and
// expensive: one publication refreshed every article, and Vercel bills each
// refreshed route as an ISR write whether or not it changed. So each rail has
// its own tag (`contentRailTag`), and the CMS works out which ones moved: it
// ranks every rail from the published list before the write and again after,
// and refreshes the ones whose links or titles differ. A new guide moves ~3.

/** Each page's rail before a write, or `null` when it could not be read — in
 * which case every rail in the section is refreshed afterwards, the old cost
 * rather than a stale rail. */
export type RailSnapshot = Map<string, string> | null;

export type RailRefresher = {
  /** Whether this section's articles render a rail at all. */
  covers(section: ContentSection): boolean;
  snapshot(section: ContentSection): Promise<Map<string, string>>;
  refreshChanged(section: ContentSection, before: RailSnapshot): Promise<void>;
};

/** The rails that differ between two snapshots, including pages present in
 * only one of them. */
export function changedRails(
  before: ReadonlyMap<string, string>,
  after: ReadonlyMap<string, string>,
): string[] {
  const slugs = new Set([...before.keys(), ...after.keys()]);
  return [...slugs].filter((slug) => before.get(slug) !== after.get(slug));
}

export function createRailRefresher(
  read: (section: ContentSection) => Promise<RailCandidate[]>,
  expire: (section: ContentSection, slug: string) => void,
): RailRefresher {
  const covers = (section: ContentSection) =>
    (RAIL_SECTIONS as readonly ContentSection[]).includes(section);
  const snapshot = async (section: ContentSection) =>
    railSignatures(await read(section));
  return {
    covers,
    snapshot,
    async refreshChanged(section, before) {
      if (!covers(section)) return;
      const after = await snapshot(section);
      const slugs = before ? changedRails(before, after) : [...after.keys()];
      for (const slug of slugs) expire(section, slug);
    },
  };
}

/** Stale rather than expired: a rail that is one request behind lists a page
 * that just went up or down, which the page itself already answers for. */
export const railRefresher: RailRefresher = createRailRefresher(
  (section) => publicContentRepository.listRailCandidates(section),
  (section, slug) => revalidateTag(contentRailTag(section, slug), "max"),
);

/** For callers that measure something other than the public cache — tests
 * that publish rows without a Next.js request context. */
export const noRails: RailRefresher = {
  covers: () => false,
  snapshot: async () => new Map(),
  refreshChanged: async () => {},
};

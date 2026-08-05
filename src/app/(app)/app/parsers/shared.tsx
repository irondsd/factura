import { Badge } from "@/components/ui";
import type { Dictionary } from "@/i18n/config";
import { interpolate } from "@/i18n/config";
import type { RouterOutputs } from "@/lib/trpc";

export type LibraryItem = RouterOutputs["parsers"]["library"][number];
export type Tier = LibraryItem["tier"];
export type TabKey = "adopted" | "marketplace" | "owned";
export type Sort = "rating" | "adoptions" | "updated" | "name";
export type ParserLabels = Dictionary["parsers"];

/** Rail key for parsers with no category (rendered as "Other"). */
export const NO_CATEGORY = "__none__";

export const tierRank = (t: Tier) =>
  t === "official" ? 0 : t === "verified" ? 1 : 2;

export function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function fmtCount(n: number): string {
  return n >= 1000
    ? `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`
    : String(n);
}

/** What makes each tab distinct: which parsers it shows, whether the trust rail
 * applies, and its search/empty copy. Everything else (cards, rail, modal) is
 * shared, so the three tabs live here as config rather than duplicated views. */
export const TAB_CONFIG: Record<
  TabKey,
  {
    predicate: (p: LibraryItem) => boolean;
    showTierRail: boolean;
    searchPlaceholder: (tp: ParserLabels) => string;
    emptyMessage: (tp: ParserLabels, query: string) => string;
  }
> = {
  adopted: {
    predicate: (p) => p.rel === "adopted",
    showTierRail: false,
    searchPlaceholder: (tp) => tp.searchAdopted,
    emptyMessage: (tp) => tp.emptyAdopted,
  },
  marketplace: {
    predicate: (p) => p.rel !== "owned",
    showTierRail: true,
    searchPlaceholder: (tp) => tp.searchMarketplace,
    emptyMessage: (tp, query) =>
      query ? interpolate(tp.emptyQuery, { q: query }) : tp.emptyNothing,
  },
  owned: {
    predicate: (p) => p.rel === "owned",
    showTierRail: false,
    searchPlaceholder: (tp) => tp.searchOwned,
    emptyMessage: (tp) => tp.emptyOwned,
  },
};

/** Built-in category keys translate; a custom label renders literally; null = "Other". */
export function catLabel(tp: ParserLabels, key: string | null): string {
  if (!key) return tp.categories.other;
  return (tp.categories as Record<string, string>)[key] ?? key;
}

/** How an owned parser's publish state renders: its badge copy + tone, and
 * whether the publish button still has anything to do. Three states, because
 * "never published" and "published, then edited" both need the owner to be able
 * to publish — only a draft that's already frozen is done. */
export function publishState(tp: ParserLabels, p: LibraryItem) {
  const done = p.ownerStatus === "published";
  return {
    done,
    tone: (done ? "accent" : "neutral") as "accent" | "neutral",
    badge: done
      ? tp.published
      : p.ownerStatus === "unpublished"
        ? tp.unpublishedChanges
        : tp.draft,
    action: done ? tp.published : tp.publish,
  };
}

/** Version dropdown options — the newest entry is tagged "latest". */
export function versionOptions(tp: ParserLabels, p: LibraryItem) {
  return p.versions.map((v, i) => ({
    value: v.version,
    label:
      i === 0
        ? interpolate(tp.versionLatest, { v: `v${v.version}` })
        : `v${v.version}`,
  }));
}

export function TierBadge({
  tier,
  labels,
}: {
  tier: Tier;
  labels: ParserLabels;
}) {
  return (
    <Badge tone={tier === "official" ? "accent" : "neutral"}>
      {labels.tiers[tier]}
    </Badge>
  );
}

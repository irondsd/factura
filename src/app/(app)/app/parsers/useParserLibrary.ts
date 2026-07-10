"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import posthog from "posthog-js";
import { interpolate } from "@/i18n/config";
import { useI18n } from "@/i18n/I18nProvider";
import { useToast } from "@/lib/toast";
import { trpc } from "@/lib/trpc";
import { PARSER_CATEGORIES } from "@/parsers/categories";
import {
  catLabel,
  type LibraryItem,
  NO_CATEGORY,
  type Sort,
  type TabKey,
  TAB_CONFIG,
  tierRank,
} from "./shared";

/** All of the parser-library screen's data, state, and actions in one place, so
 * the page and its child components stay presentational. Owns the tRPC queries,
 * the filter/sort state, and the adopt/publish/vote handlers. */
export function useParserLibrary() {
  const router = useRouter();
  const { showToast, error: toastErr } = useToast();
  const { t } = useI18n();
  const tp = t.parsers;
  const utils = trpc.useUtils();

  const lib = trpc.parsers.library.useQuery();
  const reparse = trpc.bills.reparse.useMutation();
  const adopt = trpc.parsers.adopt.useMutation();
  const unadopt = trpc.parsers.unadopt.useMutation();
  const publish = trpc.parsers.publish.useMutation();
  const vote = trpc.parsers.vote.useMutation();

  const [tab, setTabState] = useState<TabKey>("adopted");
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState<string>("all");
  const [tier, setTier] = useState<string>("all");
  const [sort, setSort] = useState<Sort>("rating");
  const [openId, setOpenId] = useState<string | null>(null);
  const [publishTarget, setPublishTarget] = useState<LibraryItem | null>(null);
  // Per-card chosen version (number). Falls back to adopted/stable when absent.
  const [selVersion, setSelVersion] = useState<Record<string, number>>({});

  const items = useMemo(() => lib.data ?? [], [lib.data]);
  const busy =
    reparse.isPending ||
    adopt.isPending ||
    unadopt.isPending ||
    publish.isPending;

  const selectedVersion = (p: LibraryItem): number =>
    selVersion[p.configId] ?? p.adoptedVersion ?? p.stable;

  const refresh = () => utils.parsers.library.invalidate();

  /** Switching tabs clears the contextual filters that don't carry over. */
  const setTab = (key: TabKey) => {
    setTabState(key);
    setQuery("");
    setCat("all");
  };

  // ── Actions ────────────────────────────────────────────────────────────────

  /** Adopt/unadopt change which parsers detect a user's bills, so always follow
   * with a reparse. */
  const withReparse = async (
    run: () => Promise<unknown>,
    label: string,
    slug: string,
  ) => {
    try {
      await run();
      await refresh();
      const res = await reparse.mutateAsync({ slug });
      showToast(
        interpolate(res.updated === 1 ? tp.reparsedOne : tp.reparsedOther, {
          label,
          n: res.updated,
        }),
      );
      utils.invalidate();
    } catch (e) {
      toastErr(e);
    }
  };

  const versionIdFor = (p: LibraryItem, version: number): string | undefined =>
    p.versions.find((v) => v.version === version)?.versionId ?? undefined;

  const onAdopt = (p: LibraryItem, version = selectedVersion(p)) => {
    posthog.capture("parser_adopted", { slug: p.slug, display_name: p.name });
    withReparse(
      () =>
        adopt.mutateAsync({
          configId: p.configId,
          versionId: versionIdFor(p, version),
        }),
      interpolate(tp.toastAdopted, { name: p.name }),
      p.slug,
    );
  };

  const onRemove = (p: LibraryItem) =>
    withReparse(
      () => unadopt.mutateAsync({ configId: p.configId }),
      tp.toastRemoved,
      p.slug,
    );

  const onPublish = (p: LibraryItem) => setPublishTarget(p);

  const doPublish = async (note: string | undefined) => {
    const p = publishTarget;
    if (!p) return;
    try {
      const r = await publish.mutateAsync({ id: p.configId, note });
      posthog.capture("parser_published", { version: r.version });
      await refresh();
      showToast(interpolate(tp.toastPublished, { n: r.version }));
      setPublishTarget(null);
    } catch (e) {
      toastErr(e);
    }
  };

  const onFork = (p: LibraryItem) =>
    router.push(`/app/builder?parser=${p.slug}`);
  const onEdit = (p: LibraryItem) =>
    router.push(`/app/builder?parser=${p.slug}`);
  const onBack = () => router.push("/app/profile");

  /** When the version dropdown changes: for an adopted parser, re-adopt that
   * version now (it's an upgrade/downgrade → reparse); otherwise just remember
   * the choice for the eventual Adopt. */
  const onVersionChange = (p: LibraryItem, version: number) => {
    setSelVersion((s) => ({ ...s, [p.configId]: version }));
    if (p.rel === "adopted" && version !== p.adoptedVersion) {
      onAdopt(p, version);
    }
  };

  const onVote = (p: LibraryItem, dir: 1 | -1) => {
    const next = p.myVote === dir ? 0 : dir;
    utils.parsers.library.setData(undefined, (old) =>
      old?.map((x) => {
        if (x.configId !== p.configId) return x;
        let { up, down } = x;
        if (x.myVote === 1) up -= 1;
        else if (x.myVote === -1) down -= 1;
        if (next === 1) up += 1;
        else if (next === -1) down += 1;
        return { ...x, up, down, myVote: next };
      }),
    );
    vote.mutateAsync({ configId: p.configId, dir: next }).catch((e) => {
      toastErr(e);
      refresh();
    });
  };

  // ── Counts + filtering (mirrors the design's renderVals) ────────────────────
  const counts = {
    adopted: items.filter(TAB_CONFIG.adopted.predicate).length,
    marketplace: items.filter(TAB_CONFIG.marketplace.predicate).length,
    owned: items.filter(TAB_CONFIG.owned.predicate).length,
  };
  const adoptedCatCount = new Set(
    items.filter(TAB_CONFIG.adopted.predicate).map((p) => p.category),
  ).size;

  const base = useMemo(
    () => items.filter(TAB_CONFIG[tab].predicate),
    [items, tab],
  );

  const cards = useMemo(() => {
    let list = base.slice();
    const q = query.trim().toLowerCase();
    if (q)
      list = list.filter((p) =>
        `${p.name} ${p.slug} ${p.provider ?? ""} ${p.category ?? ""}`
          .toLowerCase()
          .includes(q),
      );
    if (cat !== "all")
      list = list.filter((p) =>
        cat === NO_CATEGORY ? p.category == null : p.category === cat,
      );
    if (tab === "marketplace" && tier !== "all")
      list = list.filter((p) => p.tier === tier);
    return list.sort((a, b) => {
      if (sort === "adoptions") return b.adoptions - a.adoptions;
      if (sort === "updated") return b.lastUpdated.localeCompare(a.lastUpdated);
      if (sort === "name") return a.name.localeCompare(b.name);
      const na = a.up - a.down;
      const nb = b.up - b.down;
      return nb - na || tierRank(a.tier) - tierRank(b.tier);
    });
  }, [base, tab, query, cat, tier, sort]);

  // Categories present in this tab — built-in ones (in canonical order), then
  // any custom labels alphabetically, then the "Other" (null) bucket.
  const catCounts = new Map<string, number>();
  for (const p of base) {
    const k = p.category ?? NO_CATEGORY;
    catCounts.set(k, (catCounts.get(k) ?? 0) + 1);
  }
  const customKeys = [...catCounts.keys()]
    .filter(
      (k) =>
        k !== NO_CATEGORY &&
        !(PARSER_CATEGORIES as readonly string[]).includes(k),
    )
    .sort((a, b) => a.localeCompare(b));
  const orderedCats = [
    ...PARSER_CATEGORIES.filter((c) => catCounts.has(c)),
    ...customKeys,
    ...(catCounts.has(NO_CATEGORY) ? [NO_CATEGORY] : []),
  ];
  const railItems = [
    { key: "all", label: tp.railAll, count: base.length },
    ...orderedCats.map((k) => ({
      key: k,
      label: k === NO_CATEGORY ? tp.categories.other : catLabel(tp, k),
      count: catCounts.get(k) ?? 0,
    })),
  ];

  const tierChips = [
    { key: "all", label: tp.railAll },
    { key: "official", label: tp.tiers.official },
    { key: "verified", label: tp.tiers.verified },
    { key: "community", label: tp.tiers.community },
  ];

  const cfg = TAB_CONFIG[tab];
  const modal = items.find((p) => p.configId === openId) ?? null;

  return {
    tp,
    // query state
    isLoading: lib.isLoading,
    busy,
    publishPending: publish.isPending,
    // tab + filters
    tab,
    setTab,
    query,
    setQuery,
    cat,
    setCat,
    tier,
    setTier,
    sort,
    setSort,
    showTierRail: cfg.showTierRail,
    searchPlaceholder: cfg.searchPlaceholder(tp),
    emptyMsg: cfg.emptyMessage(tp, query),
    // derived data
    counts,
    adoptedCatCount,
    cards,
    railItems,
    tierChips,
    // per-card version
    selectedVersion,
    onVersionChange,
    // modal + publish target
    openId,
    setOpenId,
    modal,
    publishTarget,
    setPublishTarget,
    // actions
    onAdopt,
    onRemove,
    onPublish,
    doPublish,
    onFork,
    onEdit,
    onBack,
    onVote,
  };
}

export type ParserLibrary = ReturnType<typeof useParserLibrary>;

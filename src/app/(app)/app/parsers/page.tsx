"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import posthog from "posthog-js";
import { Display, Eyebrow } from "@/components/charts/primitives";
import { Badge, Button, Input, Label, Select } from "@/components/ui";
import { PARSER_CATEGORIES } from "@/parsers/categories";
import { interpolate } from "@/i18n/config";
import { useI18n } from "@/i18n/I18nProvider";
import { cn } from "@/lib/cn";
import { useToast } from "@/lib/toast";
import { type RouterOutputs, trpc } from "@/lib/trpc";
import { PublishDialog } from "./PublishDialog";

type LibraryItem = RouterOutputs["parsers"]["library"][number];
type Tier = LibraryItem["tier"];
type TabKey = "adopted" | "marketplace" | "owned";
type Sort = "rating" | "adoptions" | "updated" | "name";

const tierRank = (t: Tier) => (t === "official" ? 0 : t === "verified" ? 1 : 2);

/** Rail key for parsers with no category (rendered as "Other"). */
const NO_CATEGORY = "__none__";

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
function fmtCount(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k` : String(n);
}

/** Parser library (marketplace): browse, adopt, vote on, and manage parsers.
 * Three tabs — Adopted / Marketplace / Your parsers — over a single
 * `parsers.library` feed. Reached from the Profile page (power-user surface). */
export default function ParsersPage() {
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

  const [tab, setTab] = useState<TabKey>("adopted");
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

  // Built-in keys translate; a custom label renders literally; null = "Other".
  const catLabel = (key: string | null): string => {
    if (!key) return tp.categories.other;
    return (tp.categories as Record<string, string>)[key] ?? key;
  };
  const tierLabel = (tr: Tier) => tp.tiers[tr];

  const selectedVersion = (p: LibraryItem): number =>
    selVersion[p.configId] ?? p.adoptedVersion ?? p.stable;

  const refresh = () => utils.parsers.library.invalidate();

  /** Adopt/unadopt change which parsers detect a user's bills, so always follow
   * with a reparse. */
  const withReparse = async (run: () => Promise<unknown>, label: string) => {
    try {
      await run();
      await refresh();
      const res = await reparse.mutateAsync();
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
    );
  };
  const onRemove = (p: LibraryItem) =>
    withReparse(
      () => unadopt.mutateAsync({ configId: p.configId }),
      tp.toastRemoved,
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
    vote
      .mutateAsync({ configId: p.configId, dir: next })
      .catch((e) => {
        toastErr(e);
        refresh();
      });
  };

  // ── Counts + filtering (mirrors the design's renderVals) ──────────────────
  const counts = {
    adopted: items.filter((p) => p.rel === "adopted").length,
    marketplace: items.filter((p) => p.rel !== "owned").length,
    owned: items.filter((p) => p.rel === "owned").length,
  };
  const adoptedCatCount = new Set(
    items.filter((p) => p.rel === "adopted").map((p) => p.category),
  ).size;

  const base = items.filter((p) =>
    tab === "adopted"
      ? p.rel === "adopted"
      : tab === "owned"
        ? p.rel === "owned"
        : p.rel !== "owned",
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
    // base is recomputed each render but stable within one; deps cover inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, tab, query, cat, tier, sort]);

  // Categories present in this tab — built-in ones (in canonical order),
  // then any custom labels alphabetically, then the "Other" (null) bucket.
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
      label: k === NO_CATEGORY ? tp.categories.other : catLabel(k),
      count: catCounts.get(k) ?? 0,
    })),
  ];

  const tierChips: { key: string; label: string }[] = [
    { key: "all", label: tp.railAll },
    { key: "official", label: tp.tiers.official },
    { key: "verified", label: tp.tiers.verified },
    { key: "community", label: tp.tiers.community },
  ];

  const searchPlaceholder =
    tab === "owned"
      ? tp.searchOwned
      : tab === "adopted"
        ? tp.searchAdopted
        : tp.searchMarketplace;

  const emptyMsg =
    tab === "owned"
      ? tp.emptyOwned
      : tab === "adopted"
        ? tp.emptyAdopted
        : query
          ? interpolate(tp.emptyQuery, { q: query })
          : tp.emptyNothing;

  const modal = items.find((p) => p.configId === openId) ?? null;

  // ── Small presentational helpers ──────────────────────────────────────────
  const railBtn = (active: boolean) =>
    cn(
      "flex items-center justify-between gap-2 w-full text-left font-mono text-xs px-2.5 py-1.5 border-l-2 transition-colors cursor-pointer",
      active
        ? "border-accent bg-[var(--accent-soft)] text-ink"
        : "border-transparent bg-transparent text-muted hover:text-ink",
    );
  const tierBadge = (tr: Tier) => (
    <Badge tone={tr === "official" ? "accent" : "neutral"}>{tierLabel(tr)}</Badge>
  );
  const versionOptions = (p: LibraryItem) =>
    p.versions.map((v, i) => ({
      value: v.version,
      label:
        i === 0 ? interpolate(tp.versionLatest, { v: `v${v.version}` }) : `v${v.version}`,
    }));

  return (
    <div className="mx-auto max-w-[64rem] px-5 pt-8 pb-20">
      {/* header */}
      <div className="flex items-baseline justify-between gap-4 flex-wrap">
        <div>
          <Eyebrow>{tp.eyebrow}</Eyebrow>
          <Display size={34} className="block mt-1.5">
            {tp.title}
            <span className="text-accent">.</span>
          </Display>
        </div>
        <div className="text-right">
          <Eyebrow>{tp.coverage}</Eyebrow>
          <div className="font-mono text-sm text-ink mt-1">
            {interpolate(tp.coverageAdopted, { n: counts.adopted })} ·{" "}
            {interpolate(tp.coverageCats, { n: adoptedCatCount })}
          </div>
        </div>
      </div>

      {/* tabs */}
      <div className="flex gap-4 mt-5 border-b border-line">
        {(
          [
            ["adopted", tp.tabAdopted, counts.adopted],
            ["marketplace", tp.tabMarketplace, counts.marketplace],
            ["owned", tp.tabOwned, counts.owned],
          ] as const
        ).map(([key, label, n]) => (
          <button
            key={key}
            type="button"
            onClick={() => {
              setTab(key);
              setQuery("");
              setCat("all");
            }}
            className={cn(
              "font-mono text-xs uppercase tracking-[0.12em] pb-2.5 -mb-px border-b-2 cursor-pointer transition-colors",
              tab === key
                ? "border-accent text-ink"
                : "border-transparent text-muted hover:text-ink",
            )}
          >
            {label} <span className="opacity-60">{n}</span>
          </button>
        ))}
      </div>

      <div className="flex gap-6 mt-5 items-start">
        {/* rail */}
        <aside className="hidden md:flex flex-none w-[190px] flex-col gap-6 sticky top-4">
          <div>
            <Label>{tp.railCategory}</Label>
            <div className="flex flex-col mt-1">
              {railItems.map((r) => (
                <button
                  key={r.key}
                  type="button"
                  onClick={() => setCat(r.key)}
                  className={railBtn(cat === r.key)}
                >
                  <span>{r.label}</span>
                  <span className="text-muted text-[11px]">{r.count}</span>
                </button>
              ))}
            </div>
          </div>
          {tab === "marketplace" && (
            <div>
              <Label>{tp.railTrust}</Label>
              <div className="flex flex-col mt-1">
                {tierChips.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => setTier(c.key)}
                    className={railBtn(tier === c.key)}
                  >
                    <span>{c.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          <div>
            <Label>{tp.railSort}</Label>
            <Select
              value={sort}
              onChange={(e) => setSort(e.target.value as Sort)}
              className="w-full mt-1 text-xs"
            >
              <option value="rating">{tp.sortLiked}</option>
              <option value="adoptions">{tp.sortAdopted}</option>
              <option value="updated">{tp.sortUpdated}</option>
              <option value="name">{tp.sortName}</option>
            </Select>
          </div>
          <Button variant="ghost" onClick={() => router.push("/app/profile")}>
            {tp.backToProfile}
          </Button>
        </aside>

        {/* main */}
        <main className="flex-1 min-w-0">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={searchPlaceholder}
            className="mb-4"
          />

          {lib.isLoading ? (
            <p className="font-mono text-xs text-muted">{tp.loading}</p>
          ) : cards.length === 0 ? (
            <p className="text-center py-16 font-mono text-sm text-muted">
              {emptyMsg}
            </p>
          ) : (
            <div className="flex flex-col gap-2.5">
              {cards.map((p) => {
                const net = p.up - p.down;
                const adoptedElsewhere =
                  tab === "marketplace" && p.rel === "adopted";
                return (
                  <div
                    key={p.configId}
                    onClick={() => setOpenId(p.configId)}
                    className={cn(
                      "flex gap-4 items-stretch bg-card border p-4 cursor-pointer",
                      adoptedElsewhere
                        ? "border-[var(--accent-line)]"
                        : "border-line",
                    )}
                  >
                    {/* vote widget */}
                    <div className="flex-none w-9 flex flex-col items-center justify-center gap-0.5">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onVote(p, 1);
                        }}
                        className={cn(
                          "font-mono text-xs leading-none px-1.5 py-0.5 cursor-pointer",
                          p.myVote === 1 ? "text-accent" : "text-muted",
                        )}
                        aria-label={tp.upvote}
                      >
                        ▲
                      </button>
                      <span
                        className={cn(
                          "font-display font-semibold text-base leading-tight",
                          net > 0
                            ? "text-ink"
                            : net < 0
                              ? "text-accent"
                              : "text-muted",
                        )}
                      >
                        {net}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onVote(p, -1);
                        }}
                        className={cn(
                          "font-mono text-xs leading-none px-1.5 py-0.5 cursor-pointer",
                          p.myVote === -1 ? "text-accent" : "text-muted",
                        )}
                        aria-label={tp.downvote}
                      >
                        ▼
                      </button>
                    </div>
                    <div className="w-px bg-line/70" />

                    {/* content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <span className="font-display font-semibold text-[15px] text-ink">
                          {p.name}
                        </span>
                        {tierBadge(p.tier)}
                        {adoptedElsewhere && (
                          <span className="font-mono text-[10px] uppercase tracking-label text-accent">
                            {interpolate(tp.adoptedNote, {
                              v: `v${p.adoptedVersion}`,
                            })}
                          </span>
                        )}
                        {p.rel === "owned" && (
                          <Badge
                            tone={
                              p.ownerStatus === "published"
                                ? "accent"
                                : "neutral"
                            }
                          >
                            {p.ownerStatus === "published"
                              ? tp.published
                              : tp.draft}
                          </Badge>
                        )}
                      </div>
                      <div className="font-mono text-xs text-muted mt-1">
                        {p.slug}
                        {p.provider ? ` · ${p.provider}` : ""}
                      </div>
                      <div className="flex gap-3.5 mt-2 font-mono text-[11px] text-muted flex-wrap">
                        <span>{catLabel(p.category)}</span>
                        {p.region && <span>{p.region}</span>}
                        <span>
                          {interpolate(tp.adoptionsMeta, {
                            n: fmtCount(p.adoptions),
                          })}
                        </span>
                        <span>
                          {interpolate(tp.updatedMeta, {
                            date: fmtDate(p.lastUpdated),
                          })}
                        </span>
                      </div>
                    </div>

                    {/* right controls */}
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="flex-none flex flex-col items-end justify-center gap-2"
                    >
                      {p.versions.length > 1 && (
                        <Select
                          value={selectedVersion(p)}
                          onChange={(e) =>
                            onVersionChange(p, Number(e.target.value))
                          }
                          className="text-xs"
                        >
                          {versionOptions(p).map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </Select>
                      )}
                      <CardAction
                        p={p}
                        busy={busy}
                        labels={tp}
                        onAdopt={() => onAdopt(p)}
                        onRemove={() => onRemove(p)}
                        onPublish={() => onPublish(p)}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </main>
      </div>

      {/* detail modal */}
      {modal && (
        <ParserModal
          p={modal}
          labels={tp}
          selVersion={selectedVersion(modal)}
          net={modal.up - modal.down}
          fmtDate={fmtDate}
          catLabel={catLabel}
          tierBadge={tierBadge}
          versionOptions={versionOptions(modal)}
          busy={busy}
          onClose={() => setOpenId(null)}
          onVersionChange={(v) => onVersionChange(modal, v)}
          onAdopt={() => onAdopt(modal)}
          onRemove={() => onRemove(modal)}
          onPublish={() => onPublish(modal)}
          onFork={() => onFork(modal)}
          onEdit={() => onEdit(modal)}
        />
      )}
      {publishTarget && (
        <PublishDialog
          key={publishTarget.configId}
          parserName={publishTarget.name}
          busy={publish.isPending}
          onConfirm={doPublish}
          onCancel={() => setPublishTarget(null)}
        />
      )}
    </div>
  );
}

// ── Card action button ──────────────────────────────────────────────────────
function CardAction({
  p,
  busy,
  labels,
  onAdopt,
  onRemove,
  onPublish,
}: {
  p: LibraryItem;
  busy: boolean;
  labels: ReturnType<typeof useI18n>["t"]["parsers"];
  onAdopt: () => void;
  onRemove: () => void;
  onPublish: () => void;
}) {
  if (p.rel === "owned") {
    const done = p.ownerStatus === "published";
    return (
      <Button
        size="sm"
        variant={done ? "outline" : "solid"}
        disabled={busy || done}
        onClick={onPublish}
      >
        {done ? labels.published : labels.publish}
      </Button>
    );
  }
  if (p.rel === "adopted") {
    return (
      <Button size="sm" variant="ghost" disabled={busy} onClick={onRemove}>
        {labels.remove}
      </Button>
    );
  }
  return (
    <Button size="sm" variant="solid" disabled={busy} onClick={onAdopt}>
      {labels.adopt}
    </Button>
  );
}

// ── Detail modal ────────────────────────────────────────────────────────────
function ParserModal({
  p,
  labels: tp,
  selVersion,
  net,
  fmtDate,
  catLabel,
  tierBadge,
  versionOptions,
  busy,
  onClose,
  onVersionChange,
  onAdopt,
  onRemove,
  onPublish,
  onFork,
  onEdit,
}: {
  p: LibraryItem;
  labels: ReturnType<typeof useI18n>["t"]["parsers"];
  selVersion: number;
  net: number;
  fmtDate: (iso: string) => string;
  catLabel: (key: string | null) => string;
  tierBadge: (tr: LibraryItem["tier"]) => React.ReactNode;
  versionOptions: { value: number; label: string }[];
  busy: boolean;
  onClose: () => void;
  onVersionChange: (v: number) => void;
  onAdopt: () => void;
  onRemove: () => void;
  onPublish: () => void;
  onFork: () => void;
  onEdit: () => void;
}) {
  const sel =
    p.versions.find((v) => v.version === selVersion) ??
    p.versions[0] ??
    null;
  const meta = "font-mono text-[13px] text-ink mt-0.5";
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[95] flex items-center justify-center p-6">
      {/* Backdrop is its own layer so its click-to-close doesn't need the
          modal to stopPropagation, and the centering box carries no scrollbar. */}
      <div
        onClick={onClose}
        className="absolute inset-0 bg-[color-mix(in_srgb,var(--ink)_30%,transparent)]"
      />
      <div className="relative w-[min(560px,94vw)] max-h-[86vh] overflow-auto bg-card border border-line p-7 shadow-[0_18px_50px_rgba(33,29,22,0.3)]">
        <div className="flex justify-between items-start gap-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <Display size={22}>{p.name}</Display>
              {tierBadge(p.tier)}
            </div>
            <div className="font-mono text-xs text-muted mt-1">
              {p.slug} · {catLabel(p.category)}
              {p.region ? ` · ${p.region}` : ""}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="font-mono text-base text-muted cursor-pointer leading-none"
            aria-label={tp.close}
          >
            ✕
          </button>
        </div>

        <div className="grid grid-cols-2 gap-x-6 gap-y-3.5 mt-5">
          <div>
            <Label>{tp.provider}</Label>
            <div className={meta}>{p.provider ?? p.name}</div>
          </div>
          <div>
            <Label>{tp.adoption}</Label>
            <div className={meta}>
              {interpolate(tp.adoptionValue, { n: p.adoptions })}
            </div>
          </div>
          <div>
            <Label>{tp.rating}</Label>
            <div className={meta}>
              ▲ {p.up} · ▼ {p.down} · {interpolate(tp.net, { n: net })}
            </div>
          </div>
          <div>
            <Label>{tp.compatibility}</Label>
            <div className={meta}>{p.compat ?? "—"}</div>
          </div>
        </div>

        {p.forkedFrom && (
          <div className="mt-4 font-mono text-xs text-muted">
            ↳ {interpolate(tp.forkedFrom, { name: p.forkedFrom })}
          </div>
        )}

        {/* version + history */}
        <div className="mt-5">
          <div className="flex items-center justify-between">
            <Label>{tp.version}</Label>
            {versionOptions.length > 1 && (
              <Select
                value={selVersion}
                onChange={(e) => onVersionChange(Number(e.target.value))}
                className="text-xs"
              >
                {versionOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            )}
          </div>
          <div className="mt-2 border border-line bg-paper">
            {p.versions.map((v) => (
              <div
                key={v.version}
                className={cn(
                  "px-3 py-2.5 border-b border-line/60 last:border-b-0",
                  v.version === selVersion && "bg-[var(--accent-soft)]",
                )}
              >
                <div className="flex justify-between items-baseline gap-2.5">
                  <span
                    className={cn(
                      "font-mono text-xs font-medium",
                      v.version === selVersion ? "text-accent" : "text-ink",
                    )}
                  >
                    v{v.version}
                  </span>
                  <span className="font-mono text-[11px] text-muted">
                    {fmtDate(v.publishedAt)}
                  </span>
                </div>
                {v.note && (
                  <div className="font-mono text-xs text-muted mt-0.5">
                    {v.note}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* fields extracted */}
        {sel && (
          <div className="mt-5">
            <Label>
              {interpolate(tp.fieldsExtracted, { v: `v${sel.version}` })}
            </Label>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {sel.fields.map((f) => (
                <span
                  key={f}
                  className="font-mono text-[11px] text-ink bg-paper border border-line px-2 py-0.5"
                >
                  {f}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* actions */}
        <div className="flex gap-2 mt-6 flex-wrap">
          {p.rel === "owned" ? (
            <>
              <Button
                variant={p.ownerStatus === "published" ? "outline" : "solid"}
                disabled={busy || p.ownerStatus === "published"}
                onClick={onPublish}
              >
                {p.ownerStatus === "published" ? tp.published : tp.publish}
              </Button>
              <Button variant="ghost" onClick={onEdit}>
                {tp.edit}
              </Button>
            </>
          ) : p.rel === "adopted" ? (
            <>
              <Button variant="ghost" disabled={busy} onClick={onRemove}>
                {tp.remove}
              </Button>
              <Button variant="outline" onClick={onFork}>
                {tp.fork}
              </Button>
            </>
          ) : (
            <>
              <Button variant="solid" disabled={busy} onClick={onAdopt}>
                {tp.adopt}
              </Button>
              <Button variant="outline" onClick={onFork}>
                {tp.fork}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

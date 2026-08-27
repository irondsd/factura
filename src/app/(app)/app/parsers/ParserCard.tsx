"use client";

import { Badge, Button, Select } from "@/components/ui";
import { interpolate } from "@/i18n/config";
import { useT } from "@/i18n/I18nProvider";
import { cn } from "@/lib/cn";
import {
  catLabel,
  fmtCount,
  fmtDate,
  type LibraryItem,
  type ParserLabels,
  publishState,
  type TabKey,
  TierBadge,
  versionOptions,
} from "./shared";

/** ▲ net ▼ up/down-vote column. Clicks stop propagation so they don't open the
 * card's detail modal. */
function VoteWidget({
  p,
  labels: tp,
  onVote,
}: {
  p: LibraryItem;
  labels: ParserLabels;
  onVote: (dir: 1 | -1) => void;
}) {
  const net = p.up - p.down;
  return (
    <div className="flex-none w-9 flex flex-col items-center justify-center gap-0.5">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onVote(1);
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
          net > 0 ? "text-ink" : net < 0 ? "text-accent" : "text-muted",
        )}
      >
        {net}
      </span>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onVote(-1);
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
  );
}

/** The primary button in a card's right column — publish/remove/adopt depending
 * on the viewer's relationship to the parser. An owned parser also gets its
 * delete, the only way to retire a copy that's shadowing an official parser. */
function CardAction({
  p,
  busy,
  labels: tp,
  onAdopt,
  onRemove,
  onPublish,
  onDelete,
}: {
  p: LibraryItem;
  busy: boolean;
  labels: ParserLabels;
  onAdopt: () => void;
  onRemove: () => void;
  onPublish: () => void;
  onDelete: () => void;
}) {
  const t = useT("common");
  if (p.rel === "owned") {
    const state = publishState(tp, p);
    return (
      <div className="flex items-center gap-1.5">
        <Button size="sm" variant="ghost" disabled={busy} onClick={onDelete}>
          {t.delete}
        </Button>
        <Button
          size="sm"
          variant={state.done ? "outline" : "solid"}
          disabled={busy || state.done}
          onClick={onPublish}
        >
          {state.action}
        </Button>
      </div>
    );
  }
  if (p.rel === "adopted") {
    return (
      <Button size="sm" variant="ghost" disabled={busy} onClick={onRemove}>
        {tp.remove}
      </Button>
    );
  }
  return (
    <Button size="sm" variant="solid" disabled={busy} onClick={onAdopt}>
      {tp.adopt}
    </Button>
  );
}

export function ParserCard({
  p,
  tab,
  busy,
  labels: tp,
  selected,
  onOpen,
  onVote,
  onVersionChange,
  onAdopt,
  onRemove,
  onPublish,
  onDelete,
}: {
  p: LibraryItem;
  tab: TabKey;
  busy: boolean;
  labels: ParserLabels;
  selected: number;
  onOpen: (id: string) => void;
  onVote: (p: LibraryItem, dir: 1 | -1) => void;
  onVersionChange: (p: LibraryItem, version: number) => void;
  onAdopt: (p: LibraryItem) => void;
  onRemove: (p: LibraryItem) => void;
  onPublish: (p: LibraryItem) => void;
  onDelete: (p: LibraryItem) => void;
}) {
  const adoptedElsewhere = tab === "marketplace" && p.rel === "adopted";
  // Null unless the viewer owns it — carries the badge copy for its three
  // publish states (never published / published / edited since).
  const owned = p.rel === "owned" ? publishState(tp, p) : null;
  return (
    <div
      onClick={() => onOpen(p.configId)}
      className={cn(
        "flex gap-4 items-stretch bg-card border p-4 cursor-pointer",
        adoptedElsewhere ? "border-[var(--accent-line)]" : "border-line",
      )}
    >
      <VoteWidget p={p} labels={tp} onVote={(dir) => onVote(p, dir)} />
      <div className="w-px bg-line/70" />

      {/* content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="font-display font-semibold text-[15px] text-ink">
            {p.name}
          </span>
          <TierBadge tier={p.tier} labels={tp} />
          {adoptedElsewhere && (
            <span className="font-mono text-[10px] uppercase tracking-label text-accent">
              {interpolate(tp.adoptedNote, { v: `v${p.adoptedVersion}` })}
            </span>
          )}
          {owned && <Badge tone={owned.tone}>{owned.badge}</Badge>}
        </div>
        <div className="font-mono text-xs text-muted mt-1">
          {p.slug}
          {p.provider ? ` · ${p.provider}` : ""}
        </div>
        <div className="flex gap-3.5 mt-2 font-mono text-[11px] text-muted flex-wrap">
          <span>{catLabel(tp, p.category)}</span>
          {p.region && <span>{p.region}</span>}
          <span>
            {interpolate(tp.adoptionsMeta, { n: fmtCount(p.adoptions) })}
          </span>
          <span>
            {interpolate(tp.updatedMeta, { date: fmtDate(p.lastUpdated) })}
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
            value={selected}
            onChange={(e) => onVersionChange(p, Number(e.target.value))}
            className="text-xs"
          >
            {versionOptions(tp, p).map((o) => (
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
          onDelete={() => onDelete(p)}
        />
      </div>
    </div>
  );
}

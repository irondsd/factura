"use client";

import { cn } from "@/lib/cn";
import type { ParserLabels, TabKey } from "./shared";

export function TabBar({
  tab,
  counts,
  labels: tp,
  onSelect,
}: {
  tab: TabKey;
  counts: Record<TabKey, number>;
  labels: ParserLabels;
  onSelect: (key: TabKey) => void;
}) {
  const tabs: [TabKey, string, number][] = [
    ["adopted", tp.tabAdopted, counts.adopted],
    ["marketplace", tp.tabMarketplace, counts.marketplace],
    ["owned", tp.tabOwned, counts.owned],
  ];
  return (
    <div className="flex gap-4 mt-5 border-b border-line">
      {tabs.map(([key, label, n]) => (
        <button
          key={key}
          type="button"
          onClick={() => onSelect(key)}
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
  );
}

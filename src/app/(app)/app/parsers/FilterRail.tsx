"use client";

import { Button, Label, Select } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { ParserLabels, Sort } from "./shared";

const railBtn = (active: boolean) =>
  cn(
    "flex items-center justify-between gap-2 w-full text-left font-mono text-xs px-2.5 py-1.5 border-l-2 transition-colors cursor-pointer",
    active
      ? "border-accent bg-[var(--accent-soft)] text-ink"
      : "border-transparent bg-transparent text-muted hover:text-ink",
  );

type RailItem = { key: string; label: string; count: number };
type TierChip = { key: string; label: string };

/** Left rail: category filter, an optional trust-tier filter (marketplace only),
 * sort selector, and a link back to the profile. */
export function FilterRail({
  labels: tp,
  railItems,
  cat,
  onCat,
  showTierRail,
  tierChips,
  tier,
  onTier,
  sort,
  onSort,
  onBack,
}: {
  labels: ParserLabels;
  railItems: RailItem[];
  cat: string;
  onCat: (key: string) => void;
  showTierRail: boolean;
  tierChips: TierChip[];
  tier: string;
  onTier: (key: string) => void;
  sort: Sort;
  onSort: (sort: Sort) => void;
  onBack: () => void;
}) {
  return (
    <aside className="hidden md:flex flex-none w-[190px] flex-col gap-6 sticky top-4">
      <div>
        <Label>{tp.railCategory}</Label>
        <div className="flex flex-col mt-1">
          {railItems.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={() => onCat(r.key)}
              className={railBtn(cat === r.key)}
            >
              <span>{r.label}</span>
              <span className="text-muted text-[11px]">{r.count}</span>
            </button>
          ))}
        </div>
      </div>

      {showTierRail && (
        <div>
          <Label>{tp.railTrust}</Label>
          <div className="flex flex-col mt-1">
            {tierChips.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => onTier(c.key)}
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
          onChange={(e) => onSort(e.target.value as Sort)}
          className="w-full mt-1 text-xs"
        >
          <option value="rating">{tp.sortLiked}</option>
          <option value="adoptions">{tp.sortAdopted}</option>
          <option value="updated">{tp.sortUpdated}</option>
          <option value="name">{tp.sortName}</option>
        </Select>
      </div>

      <Button variant="ghost" onClick={onBack}>
        {tp.backToProfile}
      </Button>
    </aside>
  );
}

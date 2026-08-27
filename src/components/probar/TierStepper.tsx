"use client";

import { microLabel } from "@/components/ui";
import { interpolate } from "@/i18n/config";
import { useT } from "@/i18n/I18nProvider";
import { cn } from "@/lib/cn";
import { type Tier, TIERS } from "@/lib/probar";

/** What the cascade has decided about one tier so far. */
export type TierState =
  | { status: "pending" }
  | { status: "running" }
  | { status: "miss"; evaluated: number }
  | { status: "ambiguous" }
  | { status: "match" }
  /** An earlier tier already matched, so this one never ran. */
  | { status: "skipped" };

/** The cascade, made visible: official parsers get first refusal on a bill,
 * then verified, then community. Showing the steps is the point — it's how a
 * visitor learns the registry has tiers at all, and it turns dead waiting time
 * into something to read. */
export function TierStepper({ states }: { states: Record<Tier, TierState> }) {
  const t = useT("probar");
  const p = t;

  const label: Record<Tier, string> = {
    official: p.tierOfficial,
    verified: p.tierVerified,
    community: p.tierCommunity,
  };

  const describe = (state: TierState): string => {
    switch (state.status) {
      case "pending":
        return p.tierPending;
      case "running":
        return p.tierRunning;
      case "miss":
        return interpolate(p.tierMiss, { count: state.evaluated });
      case "ambiguous":
        return p.tierAmbiguous;
      case "match":
        return p.tierMatch;
      case "skipped":
        return p.tierSkipped;
    }
  };

  return (
    <ol className="flex flex-col gap-1.5" aria-live="polite">
      {TIERS.map((tier) => {
        const state = states[tier];
        const done = state.status === "match";
        const active = state.status === "running";
        return (
          <li key={tier} className="flex items-center gap-2.5">
            <span
              className={cn(
                "w-2 h-2 flex-none",
                done && "bg-accent",
                active && "bg-ink animate-pulse",
                !done && !active && "bg-line",
              )}
              aria-hidden="true"
            />
            <span
              className={cn(
                "font-mono text-xs",
                done ? "text-ink" : active ? "text-ink" : "text-muted",
              )}
            >
              {label[tier]}
            </span>
            <span className={cn(microLabel, "ml-auto")}>{describe(state)}</span>
          </li>
        );
      })}
    </ol>
  );
}

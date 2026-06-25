"use client";

import { microLabel } from "@/components/ui";
import type { ScopeValue } from "@/parsers/engine/types";
import type { RoleDef } from "@/parsers/builder/model";
import { cn } from "@/lib/cn";
import {
  CardShell,
  FallbackChain,
  ValueChip,
  ValueOption,
  ValuePicker,
} from "./shared";

// One of the four required slots (identity / amount / period / due date),
// pointing at a primary value with an ordered list of fallbacks.
export function RoleCard({
  label,
  role,
  options,
  resolved,
  onChange,
  onPreview,
  focusKey,
}: {
  label: string;
  role: RoleDef;
  options: ValueOption[];
  resolved?: { value: ScopeValue; disagree: boolean };
  onChange: (r: RoleDef) => void;
  onPreview: (name: string | null) => void;
  focusKey: string | null;
}) {
  const disagree = resolved?.disagree ?? false;
  const focused =
    !!focusKey &&
    (role.primary === focusKey || role.fallbacks.includes(focusKey));
  return (
    <CardShell focused={focused}>
      <div className="flex items-center gap-2 mb-2.5">
        <span className="font-mono text-xs font-semibold text-ink flex-1">
          {label}
        </span>
        {resolved ? (
          <ValueChip
            value={resolved.value}
            error={disagree ? "review" : null}
            title={disagree ? "sources disagree" : ""}
          />
        ) : (
          <ValueChip />
        )}
      </div>
      <div className="flex flex-col gap-2.5">
        <div>
          <span className={microLabel}>Use this value</span>
          <div className="mt-1">
            <ValuePicker
              value={role.primary}
              options={options}
              onPreview={onPreview}
              onChange={(v) => onChange({ ...role, primary: v })}
            />
          </div>
        </div>
        <div>
          <span className={microLabel}>If missing, try…</span>
          <div className="mt-1">
            <FallbackChain
              refs={role.fallbacks}
              options={options}
              onPreview={onPreview}
              onChange={(fallbacks) => onChange({ ...role, fallbacks })}
            />
          </div>
        </div>
        <label
          className={cn(
            "inline-flex items-center gap-2 cursor-pointer font-mono text-[11.5px]",
            disagree ? "text-accent" : "text-muted",
          )}
        >
          <input
            type="checkbox"
            checked={role.mustAgree}
            onChange={(e) => onChange({ ...role, mustAgree: e.target.checked })}
          />
          Must agree — flag for review if present sources disagree
          {disagree && <span className="text-accent">△ disagree</span>}
        </label>
      </div>
    </CardShell>
  );
}

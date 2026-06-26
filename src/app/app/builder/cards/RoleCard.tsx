"use client";

import { microLabel } from "@/components/ui";
import { useI18n } from "@/i18n/I18nProvider";
import type { RoleDef } from "@/parsers/builder/model";
import type { ScopeValue } from "@/parsers/engine/types";
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
  const { t } = useI18n();
  const tr = t.builder.role;
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
            error={disagree ? tr.review : null}
            title={disagree ? tr.sourcesDisagree : ""}
          />
        ) : (
          <ValueChip />
        )}
      </div>
      <div className="flex flex-col gap-2.5">
        <div>
          <span className={microLabel}>{tr.useThisValue}</span>
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
          <span className={microLabel}>{tr.ifMissing}</span>
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
          {tr.mustAgree}
          {disagree && <span className="text-accent">{tr.disagree}</span>}
        </label>
      </div>
    </CardShell>
  );
}

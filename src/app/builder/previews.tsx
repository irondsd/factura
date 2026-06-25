// The result panels under step 2 — the live structured readout, the engine's
// JSON-mode readout, and the "needs review" box for unresolved structured runs.

import { RowBox } from "@/components/ui";
import type { ParsedResult } from "@/parsers/engine/types";
import type { EvalResult } from "@/parsers/builder/evaluate";
import { cn } from "@/lib/cn";

function fmt(v: unknown): string {
  return v === undefined || v === null || v === "" ? "—" : String(v);
}

export function StructuredPreview({ result }: { result: EvalResult }) {
  const rows: [string, string][] = [
    ["Account / ID", fmt(result.roleOut.identity.value)],
    ["Amount", fmt(result.roleOut.amount.value)],
    ["Period", fmt(result.roleOut.period.value)],
    ["Due date", fmt(result.roleOut.dueDate.value)],
    ...result.custom.map((c): [string, string] => [
      `${c.name}${c.type === "quantity" && c.unit ? ` (${c.unit})` : ""}`,
      c.value === undefined
        ? "—"
        : `${c.value}${c.type === "quantity" && c.unit ? ` ${c.unit}` : ""}`,
    ]),
  ];
  return <RowBox rows={rows} />;
}

export function ParsedPreview({ result }: { result: ParsedResult }) {
  const rows: [string, string][] = [
    ["Account / ID", result.identity],
    ["Amount", String(result.amount)],
    ["Period", result.period],
    ["Due date", result.dueDate],
    ...Object.entries(result.custom).map(([k, v]): [string, string] => [
      k,
      typeof v === "object"
        ? `${v.value}${v.unit ? ` ${v.unit}` : ""}`
        : String(v),
    ]),
  ];
  return <RowBox rows={rows} />;
}

export function ReviewBox({ issues }: { issues: EvalResult["issues"] }) {
  return (
    <div className="border border-accent bg-[color-mix(in_srgb,var(--accent)_5%,transparent)]">
      {issues.map((it, i) => (
        <div
          key={i}
          className={cn(
            "py-2 px-3 font-mono text-xs text-ink",
            i === 0 ? "" : "border-t border-dashed border-accent",
          )}
        >
          <span className="text-accent">{it.type === "error" ? "✕" : "△"}</span>{" "}
          <span className="font-medium">{it.label}</span>
          {it.detail && <span className="text-muted"> — {it.detail}</span>}
        </div>
      ))}
    </div>
  );
}

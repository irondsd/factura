"use client";

import { createPortal } from "react-dom";
import { Display } from "@/components/charts/primitives";
import { Button, Label, Select } from "@/components/ui";
import { interpolate } from "@/i18n/config";
import { cn } from "@/lib/cn";
import {
  catLabel,
  fmtDate,
  type LibraryItem,
  type ParserLabels,
  TierBadge,
  versionOptions,
} from "./shared";

/** Full-detail overlay for a single parser: metadata, version history, extracted
 * fields, and the relationship-appropriate actions. Rendered in a portal. */
export function ParserModal({
  p,
  labels: tp,
  selVersion,
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
  labels: ParserLabels;
  selVersion: number;
  busy: boolean;
  onClose: () => void;
  onVersionChange: (v: number) => void;
  onAdopt: () => void;
  onRemove: () => void;
  onPublish: () => void;
  onFork: () => void;
  onEdit: () => void;
}) {
  const net = p.up - p.down;
  const options = versionOptions(tp, p);
  const sel =
    p.versions.find((v) => v.version === selVersion) ?? p.versions[0] ?? null;
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
              <TierBadge tier={p.tier} labels={tp} />
            </div>
            <div className="font-mono text-xs text-muted mt-1">
              {p.slug} · {catLabel(tp, p.category)}
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
            {options.length > 1 && (
              <Select
                value={selVersion}
                onChange={(e) => onVersionChange(Number(e.target.value))}
                className="text-xs"
              >
                {options.map((o) => (
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

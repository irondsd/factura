"use client";

import posthog from "posthog-js";
import { useState } from "react";
import { Badge, Button } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { useI18n } from "@/i18n/I18nProvider";
import { cn } from "@/lib/cn";
import { formatARS, formatMonth } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import type { Suggestion } from "@/server/suggest/rank";

/** Registry-assisted recovery for an unrecognized bill: lists the published
 * parsers that recognize THIS bill and the values each extracted from it, so the
 * user verifies correctness by eye before adopting one. Detection/extraction ran
 * server-side in a sandboxed worker (parsers.suggestForBill); adopting reuses the
 * normal adopt + reparse path — no un-adopted parser ever touched the bill. */
export function SelectParserModal({
  billId,
  onClose,
  onAdopted,
  onBuildOwn,
}: {
  billId: string | null;
  onClose: () => void;
  onAdopted: () => void;
  onBuildOwn: () => void;
}) {
  const { t, locale } = useI18n();
  const tb = t.billDrawer;
  const suggestions = trpc.parsers.suggestForBill.useQuery(
    { billId: billId! },
    { enabled: Boolean(billId) },
  );
  const adopt = trpc.parsers.adopt.useMutation();
  const reparse = trpc.bills.reparseText.useMutation();
  const [busyId, setBusyId] = useState<string | null>(null);

  if (!billId) return null;

  const onAdopt = async (s: Suggestion) => {
    if (busyId) return;
    setBusyId(s.configId);
    try {
      await adopt.mutateAsync({ configId: s.configId, versionId: s.versionId });
      await reparse.mutateAsync({ id: billId });
      posthog.capture("parser_adopted_from_suggestion", {
        config_id: s.configId,
        bill_id: billId,
      });
      onAdopted();
    } finally {
      setBusyId(null);
    }
  };

  const items = suggestions.data ?? [];

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center p-6">
      <div
        onClick={() => !busyId && onClose()}
        className="absolute inset-0 bg-[color-mix(in_srgb,var(--ink)_28%,transparent)]"
      />
      <div className="relative w-[min(560px,94vw)] max-h-[86vh] flex flex-col bg-card border border-line shadow-pop">
        <div className="p-6 pb-4 border-b border-line">
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-accent">
            {tb.selectParserEyebrow}
          </p>
          <h3 className="font-display font-semibold text-[19px] mt-2 tracking-tight">
            {tb.selectParserTitle}
          </h3>
          <p className="text-sm text-muted mt-2">{tb.selectParserIntro}</p>
        </div>

        <div className="overflow-y-auto px-6 py-4 flex flex-col gap-3">
          {suggestions.isPending ? (
            <p className="text-sm text-muted py-2">{tb.selectParserLoading}</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-muted py-2">{tb.selectParserEmpty}</p>
          ) : (
            items.map((s) => (
              <SuggestionCard
                key={s.configId}
                s={s}
                locale={locale}
                busy={busyId === s.configId}
                disabled={Boolean(busyId)}
                onAdopt={() => onAdopt(s)}
              />
            ))
          )}
        </div>

        <div className="flex gap-2 p-6 pt-4 border-t border-line">
          <Button
            variant="outline"
            onClick={onBuildOwn}
            disabled={Boolean(busyId)}
          >
            {tb.selectParserBuildOwn}
          </Button>
          <Button
            variant="ghost"
            className="ml-auto"
            onClick={onClose}
            disabled={Boolean(busyId)}
          >
            {tb.close}
          </Button>
        </div>
      </div>
    </div>
  );
}

function SuggestionCard({
  s,
  locale,
  busy,
  disabled,
  onAdopt,
}: {
  s: Suggestion;
  locale: Locale;
  busy: boolean;
  disabled: boolean;
  onAdopt: () => void;
}) {
  const { t } = useI18n();
  const tb = t.billDrawer;
  const rows: { label: string; value: string }[] = [];
  if (s.result) {
    rows.push({ label: tb.account, value: s.result.identity });
    rows.push({ label: tb.amountArs, value: formatARS(s.result.amount) });
    rows.push({
      label: tb.period,
      value: formatMonth(s.result.period, locale),
    });
    rows.push({ label: tb.dueDate, value: s.result.dueDate });
    for (const def of s.customDefs) {
      const raw = s.result.custom[def.name];
      if (raw === undefined || raw === null) continue;
      const value =
        typeof raw === "object"
          ? `${raw.value}${raw.unit ? ` ${raw.unit}` : ""}`
          : String(raw);
      rows.push({ label: def.name, value });
    }
  }

  return (
    <div className="border border-line bg-paper p-3">
      <div className="flex items-center gap-2">
        <span className="font-display font-semibold text-sm">
          {s.displayName}
        </span>
        {s.verified ? (
          <Badge tone="accent">{tb.selectParserOfficial}</Badge>
        ) : (
          <Badge tone="neutral">{tb.selectParserCommunity}</Badge>
        )}
        {s.adoptionCount > 0 && (
          <span className="font-mono text-[10.5px] text-muted">
            {s.adoptionCount} {tb.selectParserAdopters}
          </span>
        )}
        <Button
          size="sm"
          variant="solid"
          className="ml-auto"
          onClick={onAdopt}
          disabled={disabled}
        >
          {busy ? t.common.working : tb.selectParserAdopt}
        </Button>
      </div>

      {s.result ? (
        <dl className="mt-2.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
          {rows.map((r) => (
            <div key={r.label} className="contents">
              <dt className="font-mono text-[10.5px] uppercase tracking-label text-muted self-center">
                {r.label}
              </dt>
              <dd className="font-mono text-xs text-ink">{r.value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className={cn("mt-2 font-mono text-[11px] text-muted")}>
          {tb.selectParserFailed}
          {s.error ? ` — ${s.error}` : ""}
        </p>
      )}
    </div>
  );
}

"use client";

import type { ReactNode } from "react";
import { Display, Eyebrow } from "@/components/charts/primitives";
import { Bone } from "@/components/ui";
import { interpolate, type Dictionary, type Locale } from "@/i18n/config";
import { useLocale, useT } from "@/i18n/I18nProvider";
import { cn } from "@/lib/cn";
import { formatMoney, formatMonthShort, formatUSD } from "@/lib/format";
import { trpc, type RouterOutputs } from "@/lib/trpc";

/**
 * The profile page's stat cards — the account's own record, over every property
 * the reader belongs to plus their unfiled inbox.
 *
 * Money reads USD-first throughout, with pesos underneath as "what was actually
 * billed". That isn't a display preference: a peso total spanning several years
 * of Argentine inflation is a sum of different units, so it is reported but
 * never used to rank anything (see server/routers/account.stats.ts).
 *
 * The section hides itself on an empty ledger. A profile that opens on six
 * zeroes reads as a broken page, not an empty one.
 */

type Stats = RouterOutputs["account"]["stats"];

/** "2026-03" -> "mar 2026" — compact enough not to wrap inside a card, unlike
 * the full "marzo de 2026". */
function monthLabel(month: string, locale: Locale): string {
  const name = formatMonthShort(month, locale).replace(".", "");
  return `${name} ${month.slice(0, 4)}`;
}

function StatCard({
  label,
  value,
  lines = [],
}: {
  label: string;
  value: ReactNode;
  /** Secondary readouts, one per line under the number. */
  lines?: (string | null | false)[];
}) {
  return (
    <div className="border border-line bg-card p-4">
      <p className="font-mono text-micro uppercase tracking-label-wide text-muted">
        {label}
      </p>
      <div className="mt-1.5">
        <Display size={26}>{value}</Display>
      </div>
      {lines.filter(Boolean).map((line) => (
        <p key={String(line)} className="font-mono text-xs text-muted mt-1">
          {line}
        </p>
      ))}
    </div>
  );
}

const grid = "mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3";

function Heading({ children }: { children: string }) {
  return (
    <h2 className="mt-10">
      <Eyebrow>{children}</Eyebrow>
    </h2>
  );
}

function Skeleton() {
  return (
    <div className={grid} aria-hidden="true">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="border border-line bg-card p-4">
          <p className="font-mono text-micro uppercase tracking-label-wide text-muted">
            <Bone chars={12} />
          </p>
          <div className="mt-1.5">
            <Display size={26}>
              <Bone chars={5} />
            </Display>
          </div>
          <p className="font-mono text-xs text-muted mt-1">
            <Bone chars={16} />
          </p>
        </div>
      ))}
    </div>
  );
}

export function ProfileStats() {
  const t = useT("profile");
  const locale = useLocale();
  const ts = t.stats;
  const { data, isPending } = trpc.account.stats.useQuery();

  if (isPending)
    return (
      <>
        <Heading>{ts.eyebrow}</Heading>
        <Skeleton />
      </>
    );
  if (!data || data.bills.total === 0) return null;

  return (
    <>
      <Heading>{ts.eyebrow}</Heading>
      <div
        className={cn(grid, "motion-safe:animate-[fd-fade-in_360ms_ease-out]")}
      >
        {cards(data, ts, locale).map((c) => (
          <StatCard key={c.label} {...c} />
        ))}
      </div>
    </>
  );
}

function cards(
  d: Stats,
  ts: Dictionary["profile"]["stats"],
  locale: Locale,
) {
  const { bills, money, history, biggest, topMonth, parsers } = d;
  const ars = (v: number) => formatMoney(v, "ARS");
  const asBilled = (v: number) =>
    interpolate(ts.total.asBilled, { amount: ars(v) });

  const out: {
    label: string;
    value: ReactNode;
    lines?: (string | null | false)[];
  }[] = [
    {
      label: ts.bills.label,
      value: String(bills.total),
      lines: [
        bills.files === 0
          ? ts.bills.filesNone
          : bills.files === 1
            ? ts.bills.filesOne
            : interpolate(ts.bills.filesOther, { n: bills.files }),
        // Only worth saying in a shared property, where some of the ledger
        // came from someone else.
        bills.mine < bills.total &&
          interpolate(ts.bills.mine, { n: bills.mine }),
      ],
    },
    {
      label: ts.total.label,
      value: money.usd > 0 ? formatUSD(money.usd) : ars(money.ars),
      lines: [
        money.usd > 0 && asBilled(money.ars),
        // Bills still in review carry no amount, so the total is over a
        // subset — say so rather than let it read as the whole ledger.
        money.counted < bills.total &&
          interpolate(ts.total.counted, { n: money.counted }),
      ],
    },
  ];

  if (history.firstMonth) {
    out.push({
      label: ts.since.label,
      value: monthLabel(history.firstMonth, locale),
      lines: [
        history.monthsSpan <= 1
          ? ts.since.one
          : interpolate(ts.since.months, {
              covered: history.monthsCovered,
              span: history.monthsSpan,
            }),
      ],
    });
  }

  out.push(
    parsers.created > 0
      ? {
          label: ts.parsers.label,
          value: String(parsers.created),
          lines: [
            parsers.published === 0
              ? ts.parsers.publishedNone
              : parsers.published === 1
                ? ts.parsers.publishedOne
                : interpolate(ts.parsers.publishedOther, {
                    n: parsers.published,
                  }),
            parsers.adopters > 0 &&
              (parsers.adopters === 1
                ? ts.parsers.adoptersOne
                : interpolate(ts.parsers.adoptersOther, {
                    n: parsers.adopters,
                  })),
          ],
        }
      : {
          label: ts.parsers.adoptedLabel,
          value: String(parsers.adopted),
          lines: [ts.parsers.adoptedHelp],
        },
  );

  if (biggest) {
    const where = [
      biggest.vendor ?? ts.biggest.noVendor,
      biggest.month && monthLabel(biggest.month, locale),
    ]
      .filter(Boolean)
      .join(" · ");
    out.push({
      label: ts.biggest.label,
      value: biggest.usd !== null ? formatUSD(biggest.usd) : ars(biggest.ars),
      lines: [where, biggest.usd !== null && asBilled(biggest.ars)],
    });
  }

  if (topMonth) {
    const amount =
      topMonth.usd > 0 ? formatUSD(topMonth.usd) : ars(topMonth.ars);
    out.push({
      label: ts.topMonth.label,
      value: monthLabel(topMonth.month, locale),
      lines: [
        topMonth.bills === 1
          ? interpolate(ts.topMonth.billsOne, { amount })
          : interpolate(ts.topMonth.billsOther, {
              amount,
              n: topMonth.bills,
            }),
      ],
    });
  }

  return out;
}

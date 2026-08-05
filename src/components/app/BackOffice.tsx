"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Eyebrow } from "@/components/charts/primitives";
import { Bone, buttonClass } from "@/components/ui";
import { interpolate } from "@/i18n/config";
import { useI18n } from "@/i18n/I18nProvider";
import { cn } from "@/lib/cn";
import { trpc } from "@/lib/trpc";

/**
 * The three pages the profile hands off to — properties, parsers, sessions —
 * as one card of rows rather than three headed sections with a button each.
 *
 * Every row carries its own live count, which is the point: the reader can see
 * what is behind a door before opening it, and a row whose number is zero is
 * the cheapest possible nudge to go set it up.
 *
 * The counts cost nothing extra to fetch. `properties.list` is already in the
 * cache from the header's property switcher and `account.stats` from the stat
 * cards above; only `sessions.list` is this page's own, and it is a single
 * indexed read.
 */

function Row({
  name,
  count,
  help,
  href,
  last,
}: {
  name: string;
  /** The row's live state, in the muted register — or a bone while it loads. */
  count: ReactNode;
  help: string;
  href: string;
  last?: boolean;
}) {
  const { t } = useI18n();
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-6 gap-y-3 py-[18px] px-5",
        last ? "" : "border-b border-line",
      )}
    >
      <div className="flex-1 min-w-[220px]">
        <div className="flex items-baseline gap-2.5">
          <span className="font-mono text-[15px] font-medium text-ink">
            {name}
          </span>
          <span className="font-mono text-xs text-muted">{count}</span>
        </div>
        <p className="font-mono text-xs text-muted mt-[5px] leading-[1.5]">
          {help}
        </p>
      </div>
      {/* The ghost's transparent border is already in the box, so the accent
          hover outline costs no reflow. */}
      <Link
        href={href}
        className={cn(buttonClass("ghost"), "hover:border-accent")}
      >
        {t.profile.manage}
      </Link>
    </div>
  );
}

export function BackOffice() {
  const { t } = useI18n();
  const tp = t.profile;

  const properties = trpc.properties.list.useQuery();
  const stats = trpc.account.stats.useQuery();
  const sessions = trpc.sessions.list.useQuery();

  return (
    <>
      <h2 className="mt-10 mb-2.5">
        <Eyebrow>{tp.backOffice.eyebrow}</Eyebrow>
      </h2>
      <div className="border border-line bg-card">
        <Row
          name={tp.properties.name}
          help={tp.properties.help}
          href="/app/properties"
          count={
            properties.data ? (
              propertiesCount(properties.data, tp.properties)
            ) : (
              <Bone chars={12} />
            )
          }
        />
        <Row
          name={tp.parsers.name}
          help={tp.parsers.help}
          href="/app/parsers"
          count={
            stats.data ? (
              parsersCount(stats.data.parsers, tp.parsers)
            ) : (
              <Bone chars={12} />
            )
          }
        />
        <Row
          name={tp.sessions.name}
          help={tp.sessions.help}
          href="/app/sessions"
          last
          count={
            sessions.data ? (
              sessionsCount(sessions.data, tp.sessions)
            ) : (
              <Bone chars={12} />
            )
          }
        />
      </div>
    </>
  );
}

type Dict = ReturnType<typeof useI18n>["t"]["profile"];

/** "3 · 1 compartida" — a property is shared when someone other than the
 * reader is a member of it. */
function propertiesCount(
  rows: { members: unknown[] }[],
  d: Dict["properties"],
): string {
  if (rows.length === 0) return d.none;
  const shared = rows.filter((p) => p.members.length > 1).length;
  if (shared === 0) return String(rows.length);
  const suffix =
    shared === 1 ? d.sharedOne : interpolate(d.sharedOther, { n: shared });
  return `${rows.length} · ${suffix}`;
}

/** "3 · 1 publicado" for an author, "2 adoptados" for everyone else — the two
 * halves of parser standing, same split the stat card makes. */
function parsersCount(
  p: { created: number; published: number; adopted: number },
  d: Dict["parsers"],
): string {
  if (p.created === 0) {
    if (p.adopted === 0) return d.none;
    return p.adopted === 1
      ? d.adoptedOne
      : interpolate(d.adoptedOther, { n: p.adopted });
  }
  if (p.published === 0) return String(p.created);
  const suffix =
    p.published === 1
      ? d.publishedOne
      : interpolate(d.publishedOther, { n: p.published });
  return `${p.created} · ${suffix}`;
}

/** "2 abiertas · esta incluida", the last part in the olive positive tone —
 * this browser being on the list is reassurance, not something to act on. The
 * list already hides expired rows, so its length is the number of browsers
 * actually holding a key right now. */
function sessionsCount(
  rows: { current: boolean }[],
  d: Dict["sessions"],
): ReactNode {
  const open =
    rows.length === 1
      ? d.openOne
      : interpolate(d.openOther, { n: rows.length });
  if (!rows.some((s) => s.current)) return open;
  return (
    <>
      {open} · <span className="text-ok">{d.thisOne}</span>
    </>
  );
}

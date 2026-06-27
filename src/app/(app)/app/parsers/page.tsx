"use client";

import { useRouter } from "next/navigation";
import posthog from "posthog-js";
import { Display, Eyebrow } from "@/components/charts/primitives";
import { Badge, Button } from "@/components/ui";
import { interpolate } from "@/i18n/config";
import { useI18n } from "@/i18n/I18nProvider";
import { cn } from "@/lib/cn";
import { useToast } from "@/lib/toast";
import { trpc } from "@/lib/trpc";

const parserRow =
  "flex flex-wrap items-center gap-2.5 border border-line bg-card py-2.5 px-3";
const parserMeta = "font-mono text-xs text-muted";
const sectionTitle = "mt-10 mb-1";
const help = "font-mono text-xs text-muted mb-3 max-w-[520px] leading-[1.6]";
const nameStyle = "font-mono font-semibold text-sm";

/** Parser library + registry: manage your own parsers (edit / publish / delete),
 * the official/community ones you've adopted (update / fork / remove), and
 * browse published parsers to adopt. Mirrors the registry model in
 * src/server/registry.ts. Reached from the Profile page (not in the nav — it's a
 * power-user surface). */
export default function ParsersPage() {
  const router = useRouter();
  const { showToast, error: toastErr } = useToast();
  const { t } = useI18n();
  const tp = t.parsers;
  const utils = trpc.useUtils();

  const list = trpc.parsers.list.useQuery();
  const browse = trpc.parsers.browse.useQuery();
  const active = trpc.parsers.active.useQuery();
  const reparse = trpc.bills.reparse.useMutation();
  const publish = trpc.parsers.publish.useMutation();
  const del = trpc.parsers.delete.useMutation();
  const adopt = trpc.parsers.adopt.useMutation();
  const unadopt = trpc.parsers.unadopt.useMutation();

  type ListItem = NonNullable<typeof list.data>[number];
  type OwnItem = Extract<ListItem, { editable: true }>;
  const items: ListItem[] = list.data ?? [];
  const own = items.filter((p): p is OwnItem => p.editable);
  const adopted = items.filter(
    (p): p is Exclude<ListItem, OwnItem> => !p.editable,
  );
  const adoptedIds = new Set(adopted.map((p) => p.id));
  const browseByConfig = new Map(
    (browse.data ?? []).map((b) => [b.configId, b]),
  );
  // browse already excludes packages you own; drop the ones you've adopted to
  // get the "new to you" registry.
  const registry = (browse.data ?? []).filter(
    (b) => !adoptedIds.has(b.configId),
  );

  const busy =
    reparse.isPending || adopt.isPending || unadopt.isPending || del.isPending;

  const refresh = async () => {
    await utils.parsers.list.invalidate();
    await utils.parsers.browse.invalidate();
  };

  /** Adopt/unadopt change which parsers detect a user's bills, so always follow
   * with a reparse — same contract as the builder's save flow. */
  const withReparse = async (run: () => Promise<unknown>, label: string) => {
    try {
      await run();
      await refresh();
      const res = await reparse.mutateAsync();
      showToast(
        interpolate(res.updated === 1 ? tp.reparsedOne : tp.reparsedOther, {
          label,
          n: res.updated,
        }),
      );
      utils.invalidate();
    } catch (e) {
      toastErr(e);
    }
  };

  /** Standalone reparse (panel button): apply the current winning parsers to
   * existing bills without adopting/forking anything first. */
  const onReparse = async () => {
    try {
      const res = await reparse.mutateAsync();
      utils.invalidate();
      showToast(
        interpolate(tp.reparsedStandalone, {
          updated: res.updated,
          scanned: res.scanned,
        }),
      );
    } catch (e) {
      toastErr(e);
    }
  };

  const onPublish = async (id: string) => {
    try {
      const r = await publish.mutateAsync({ id });
      posthog.capture("parser_published", { version: r.version });
      await refresh();
      showToast(interpolate(tp.toastPublished, { n: r.version }));
    } catch (e) {
      toastErr(e);
    }
  };

  const ownStatus = (p: OwnItem) => {
    if (p.latestPublishedVersion == null)
      return { label: tp.unpublished, canPublish: true };
    if (p.latestPublishedVersion < p.version)
      return { label: tp.unpublishedChanges, canPublish: true };
    return {
      label: interpolate(tp.publishedV, { n: p.latestPublishedVersion }),
      canPublish: false,
    };
  };

  return (
    <div className="mx-auto max-w-[52rem] px-5 pt-8 pb-20">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <div>
          <Eyebrow>{tp.eyebrow}</Eyebrow>
          <Display size={34} className="block mt-1.5">
            {tp.title}
          </Display>
        </div>
        <Button variant="ghost" onClick={() => router.push("/app/profile")}>
          {tp.backToProfile}
        </Button>
      </div>

      {(() => {
        const rows = active.data ?? [];
        const total = rows.reduce((n, r) => n + r.billCount, 0);
        return (
          <>
            <div className="mt-8 mb-1 flex items-baseline justify-between gap-3 flex-wrap">
              <Eyebrow>{tp.active}</Eyebrow>
              <Button
                size="sm"
                variant="solid"
                disabled={busy || total === 0}
                onClick={onReparse}
              >
                {tp.reparseBtn}
                {total > 0 ? ` (${total})` : ""}
              </Button>
            </div>
            <p className={help}>{tp.activeHelp}</p>
            <div className="flex flex-col gap-2">
              {rows.length === 0 && (
                <p className={parserMeta}>{tp.noneActive}</p>
              )}
              {rows.map((r) => (
                <div key={r.slug} className={parserRow}>
                  <span className={nameStyle}>{r.displayName}</span>
                  <span className={parserMeta}>
                    {r.slug}
                    {r.version > 0 ? ` · v${r.version}` : ""}
                  </span>
                  {r.source === "own" && (
                    <Badge tone="accent">{tp.yourParser}</Badge>
                  )}
                  {r.source === "official" && (
                    <Badge tone="neutral">{tp.official}</Badge>
                  )}
                  {r.source === "community" && (
                    <Badge tone="neutral">{tp.community}</Badge>
                  )}
                  {r.source === "none" && (
                    <Badge tone="neutral">{tp.noParser}</Badge>
                  )}
                  {r.shadowsAdopted && (
                    <span className={parserMeta}>{tp.shadows}</span>
                  )}
                  {r.source === "none" && (
                    <span className={parserMeta}>{tp.noneWontReparse}</span>
                  )}
                  <span className={cn(parserMeta, "ml-auto")}>
                    {interpolate(
                      r.billCount === 1 ? tp.billOne : tp.billOther,
                      {
                        n: r.billCount,
                      },
                    )}
                  </span>
                </div>
              ))}
            </div>
          </>
        );
      })()}

      <h2 className={sectionTitle}>
        <Eyebrow>{tp.yourParsers}</Eyebrow>
      </h2>
      <p className={help}>{tp.yourParsersHelp}</p>
      <div className="flex flex-col gap-2">
        {own.length === 0 && <p className={parserMeta}>{tp.noneYetOwn}</p>}
        {own.map((p) => {
          const st = ownStatus(p);
          return (
            <div key={p.id} className={parserRow}>
              <span className={nameStyle}>{p.displayName}</span>
              <span className={parserMeta}>{p.slug}</span>
              <Badge tone={st.canPublish ? "neutral" : "accent"}>
                {st.label}
              </Badge>
              <div className="ml-auto flex gap-1.5">
                <Button
                  size="sm"
                  onClick={() => router.push(`/app/builder?parser=${p.slug}`)}
                >
                  {tp.edit}
                </Button>
                {st.canPublish && (
                  <Button
                    size="sm"
                    variant="solid"
                    disabled={publish.isPending}
                    onClick={() => onPublish(p.id)}
                  >
                    {tp.publish}
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => {
                    if (
                      !confirm(
                        interpolate(tp.confirmDelete, {
                          name: p.displayName,
                        }),
                      )
                    )
                      return;
                    withReparse(
                      () => del.mutateAsync({ id: p.id }),
                      tp.toastParserDeleted,
                    );
                  }}
                >
                  {t.common.delete}
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      <h2 className={sectionTitle}>
        <Eyebrow>{tp.adopted}</Eyebrow>
      </h2>
      <p className={help}>{tp.adoptedHelp}</p>
      <div className="flex flex-col gap-2">
        {adopted.length === 0 && <p className={parserMeta}>{tp.noneAdopted}</p>}
        {adopted.map((p) => {
          const upstream = browseByConfig.get(p.id);
          const updatable = upstream != null && upstream.version > p.version;
          return (
            <div key={p.id} className={parserRow}>
              <span className={nameStyle}>{p.displayName}</span>
              <span className={parserMeta}>
                {p.slug} · v{p.version}
              </span>
              {upstream?.verified && <Badge tone="accent">{tp.official}</Badge>}
              <div className="ml-auto flex gap-1.5">
                {updatable && (
                  <Button
                    size="sm"
                    variant="solid"
                    disabled={busy}
                    onClick={() =>
                      withReparse(
                        () => adopt.mutateAsync({ configId: p.id }),
                        interpolate(tp.toastUpdatedTo, {
                          n: upstream.version,
                        }),
                      )
                    }
                  >
                    {interpolate(tp.updateToV, { n: upstream.version })}
                  </Button>
                )}
                <Button
                  size="sm"
                  onClick={() => router.push(`/app/builder?parser=${p.slug}`)}
                >
                  {tp.fork}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() =>
                    withReparse(
                      () => unadopt.mutateAsync({ configId: p.id }),
                      tp.toastRemoved,
                    )
                  }
                >
                  {tp.remove}
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      <h2 className={sectionTitle}>
        <Eyebrow>{tp.browse}</Eyebrow>
      </h2>
      <p className={help}>{tp.browseHelp}</p>
      <div className="flex flex-col gap-2">
        {registry.length === 0 && <p className={parserMeta}>{tp.nothingNew}</p>}
        {registry.map((b) => (
          <div key={b.configId} className={parserRow}>
            <span className={nameStyle}>{b.displayName}</span>
            <span className={parserMeta}>
              {b.slug} · v{b.version}
            </span>
            {b.verified && <Badge tone="accent">{tp.official}</Badge>}
            <Button
              size="sm"
              variant="solid"
              disabled={busy}
              className="ml-auto"
              onClick={() => {
                posthog.capture("parser_adopted", {
                  slug: b.slug,
                  display_name: b.displayName,
                });
                withReparse(
                  () => adopt.mutateAsync({ configId: b.configId }),
                  interpolate(tp.toastAdopted, { name: b.displayName }),
                );
              }}
            >
              {tp.adopt}
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

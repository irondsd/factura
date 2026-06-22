"use client";

import { useRouter } from "next/navigation";
import { useApp } from "@/components/app/context";
import { Display, Eyebrow } from "@/components/charts/primitives";
import { Badge, Button } from "@/components/ui";
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
  const { showToast } = useApp();
  const utils = trpc.useUtils();

  const list = trpc.parsers.list.useQuery();
  const browse = trpc.parsers.browse.useQuery();
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
      showToast(`${label} · reparsed ${res.updated} bill(s)`);
      utils.invalidate();
    } catch (e) {
      showToast(`✕ ${e instanceof Error ? e.message : e}`);
    }
  };

  const onPublish = async (id: string) => {
    try {
      const r = await publish.mutateAsync({ id });
      await refresh();
      showToast(`Published v${r.version}`);
    } catch (e) {
      showToast(`✕ ${e instanceof Error ? e.message : e}`);
    }
  };

  const ownStatus = (p: OwnItem) => {
    if (p.latestPublishedVersion == null)
      return { label: "Unpublished", canPublish: true };
    if (p.latestPublishedVersion < p.version)
      return { label: "Unpublished changes", canPublish: true };
    return {
      label: `Published v${p.latestPublishedVersion}`,
      canPublish: false,
    };
  };

  return (
    <div className="mx-auto max-w-[52rem] px-5 pt-8 pb-20">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <div>
          <Eyebrow>Parsers</Eyebrow>
          <Display size={34} className="block mt-1.5">
            Parser library
          </Display>
        </div>
        <Button variant="ghost" onClick={() => router.push("/profile")}>
          ← Profile
        </Button>
      </div>

      <h2 className={sectionTitle}>
        <Eyebrow>Your parsers</Eyebrow>
      </h2>
      <p className={help}>
        Parsers you own. Editing affects only your bills until you publish a
        version others can adopt.
      </p>
      <div className="flex flex-col gap-2">
        {own.length === 0 && (
          <p className={parserMeta}>
            None yet — fork an official parser below, or build one from a bill.
          </p>
        )}
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
                  onClick={() => router.push(`/builder?parser=${p.slug}`)}
                >
                  Edit
                </Button>
                {st.canPublish && (
                  <Button
                    size="sm"
                    variant="solid"
                    disabled={publish.isPending}
                    onClick={() => onPublish(p.id)}
                  >
                    Publish
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => {
                    if (
                      !confirm(
                        `Delete parser "${p.displayName}"? This can't be undone.`,
                      )
                    )
                      return;
                    withReparse(
                      () => del.mutateAsync({ id: p.id }),
                      "Parser deleted",
                    );
                  }}
                >
                  Delete
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      <h2 className={sectionTitle}>
        <Eyebrow>Adopted parsers</Eyebrow>
      </h2>
      <p className={help}>
        Published parsers you run. Fork one to customize it for your own bills.
      </p>
      <div className="flex flex-col gap-2">
        {adopted.length === 0 && <p className={parserMeta}>None adopted.</p>}
        {adopted.map((p) => {
          const upstream = browseByConfig.get(p.id);
          const updatable = upstream != null && upstream.version > p.version;
          return (
            <div key={p.id} className={parserRow}>
              <span className={nameStyle}>{p.displayName}</span>
              <span className={parserMeta}>
                {p.slug} · v{p.version}
              </span>
              {upstream?.verified && <Badge tone="accent">official</Badge>}
              <div className="ml-auto flex gap-1.5">
                {updatable && (
                  <Button
                    size="sm"
                    variant="solid"
                    disabled={busy}
                    onClick={() =>
                      withReparse(
                        () => adopt.mutateAsync({ configId: p.id }),
                        `Updated to v${upstream.version}`,
                      )
                    }
                  >
                    Update to v{upstream.version}
                  </Button>
                )}
                <Button
                  size="sm"
                  onClick={() => router.push(`/builder?parser=${p.slug}`)}
                >
                  Fork
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() =>
                    withReparse(
                      () => unadopt.mutateAsync({ configId: p.id }),
                      "Removed",
                    )
                  }
                >
                  Remove
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      <h2 className={sectionTitle}>
        <Eyebrow>Browse registry</Eyebrow>
      </h2>
      <p className={help}>
        Published parsers from other users. Adopt one to detect its vendor.
      </p>
      <div className="flex flex-col gap-2">
        {registry.length === 0 && (
          <p className={parserMeta}>Nothing new to adopt.</p>
        )}
        {registry.map((b) => (
          <div key={b.configId} className={parserRow}>
            <span className={nameStyle}>{b.displayName}</span>
            <span className={parserMeta}>
              {b.slug} · v{b.version}
            </span>
            {b.verified && <Badge tone="accent">official</Badge>}
            <Button
              size="sm"
              variant="solid"
              disabled={busy}
              className="ml-auto"
              onClick={() =>
                withReparse(
                  () => adopt.mutateAsync({ configId: b.configId }),
                  `Adopted ${b.displayName}`,
                )
              }
            >
              Adopt
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

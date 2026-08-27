"use client";

import { useState } from "react";
import { AccessTokens } from "@/components/app/AccessTokens";
import { ConnectedApps } from "@/components/app/ConnectedApps";
import { Display, Eyebrow } from "@/components/charts/primitives";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Badge, Bone, Button } from "@/components/ui";
import { interpolate } from "@/i18n/config";
import { useLocale, useT } from "@/i18n/I18nProvider";
import { formatDate, formatRelativeTime } from "@/lib/format";
import { useToast } from "@/lib/toast";
import { trpc } from "@/lib/trpc";

const help =
  "font-mono text-xs text-muted mb-[14px] max-w-[540px] leading-[1.6]";
const card = "border border-line bg-card p-[18px] mb-3";
const meta = "font-mono text-micro text-muted mt-1";

export default function SessionsPage() {
  const t = useT("sessions");
  const locale = useLocale();
  const ts = t;
  const { opts } = useToast();
  const utils = trpc.useUtils();

  const list = trpc.sessions.list.useQuery();
  const invalidate = () => utils.sessions.list.invalidate();

  const revoke = trpc.sessions.revoke.useMutation({ onSuccess: invalidate });
  const revokeOthers = trpc.sessions.revokeOthers.useMutation({
    onSuccess: invalidate,
  });

  // Both dialogs are modal on purpose: revoking is not undoable, and the row
  // being revoked is the only place its description comes from.
  const [revoking, setRevoking] = useState<{
    id: string;
    device: string;
  } | null>(null);
  const [signingOutOthers, setSigningOutOthers] = useState(false);

  const rows = list.data ?? [];
  const others = rows.filter((s) => !s.current).length;

  /** "Chrome · macOS", degrading to whatever half we could read. */
  const deviceName = (s: { browser: string | null; os: string | null }) =>
    [s.browser ?? ts.unknownBrowser, s.os].filter(Boolean).join(" · ");

  // Country codes are stored, not names, so the country reads in the language
  // the page is in. Falls back to the bare code if the runtime can't name it.
  const regionNames = new Intl.DisplayNames([locale], { type: "region" });
  const place = (s: { city: string | null; country: string | null }) => {
    const country = s.country ? (regionNames.of(s.country) ?? s.country) : null;
    return [s.city, country].filter(Boolean).join(", ") || ts.unknownLocation;
  };

  return (
    <div className="mx-auto max-w-[52rem] px-5 pt-8 pb-20">
      <Eyebrow>{ts.eyebrow}</Eyebrow>
      <Display size={34} className="block mt-1.5">
        {ts.title}
      </Display>
      <p className={`${help} mt-[14px]`}>{ts.help}</p>

      <Button
        variant="outline"
        disabled={others === 0 || revokeOthers.isPending}
        onClick={() => setSigningOutOthers(true)}
      >
        {ts.revokeOthers}
      </Button>

      <h2 className="mt-9 mb-1">
        <Eyebrow>{ts.browsers}</Eyebrow>
      </h2>
      <p className={help}>{ts.browsersHelp}</p>

      {list.isPending ? (
        <div className={card} aria-busy="true" aria-label={ts.loading}>
          <Bone chars={18} className="font-display text-lg" />
          <p className={meta}>
            <Bone chars={30} />
          </p>
        </div>
      ) : (
        rows.map((s) => (
          <div key={s.id} className={card}>
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="font-display font-semibold text-[15px] tracking-tight">
                {deviceName(s)}
              </span>
              {s.installed && <Badge tone="neutral">{ts.installed}</Badge>}
              {s.current && <Badge>{ts.current}</Badge>}
              {!s.current && (
                <Button
                  variant="ghost"
                  className="ml-auto"
                  disabled={revoke.isPending}
                  onClick={() =>
                    setRevoking({ id: s.id, device: deviceName(s) })
                  }
                >
                  {ts.revoke}
                </Button>
              )}
            </div>
            <p className={meta}>
              {place(s)}
              {" · "}
              {s.ip ?? ts.unknownIp}
            </p>
            <p className={meta}>
              {interpolate(ts.lastActive, {
                when: s.current
                  ? ts.now
                  : formatRelativeTime(s.lastActiveAt, locale),
              })}
              {" · "}
              {interpolate(ts.startedOn, {
                date: formatDate(s.createdAt, locale),
              })}
            </p>
          </div>
        ))
      )}

      {/* Connected apps (MCP) and hand-made tokens, on this page as planned:
          "who holds a key to this account" is one question, and the answer has
          to be revocable in one place. Both take the page's shared class strings
          so the three sections stay visually one list. */}
      <ConnectedApps help={help} card={card} meta={meta} />
      <AccessTokens help={help} card={card} meta={meta} />

      <ConfirmDialog
        open={revoking !== null}
        eyebrow={ts.confirmRevoke.eyebrow}
        title={ts.confirmRevoke.title}
        description={interpolate(ts.confirmRevoke.description, {
          device: revoking?.device ?? "",
        })}
        confirmLabel={ts.revoke}
        busy={revoke.isPending}
        onCancel={() => setRevoking(null)}
        onConfirm={() => {
          if (!revoking) return;
          revoke.mutate({ id: revoking.id }, opts(ts.toastRevoked));
          setRevoking(null);
        }}
      />

      <ConfirmDialog
        open={signingOutOthers}
        eyebrow={ts.confirmOthers.eyebrow}
        title={ts.confirmOthers.title}
        description={interpolate(
          others === 1
            ? ts.confirmOthers.descriptionOne
            : ts.confirmOthers.description,
          { count: others },
        )}
        confirmLabel={ts.confirmOthers.confirm}
        busy={revokeOthers.isPending}
        onCancel={() => setSigningOutOthers(false)}
        onConfirm={() => {
          revokeOthers.mutate(undefined, opts(ts.toastRevokedOthers));
          setSigningOutOthers(false);
        }}
      />
    </div>
  );
}

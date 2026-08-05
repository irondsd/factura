"use client";

import { useState } from "react";
import { Eyebrow } from "@/components/charts/primitives";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Bone, Button } from "@/components/ui";
import { interpolate } from "@/i18n/config";
import { useI18n } from "@/i18n/I18nProvider";
import { formatDate, formatRelativeTime } from "@/lib/format";
import { useToast } from "@/lib/toast";
import { trpc } from "@/lib/trpc";

/** Apps connected over MCP — an assistant the user walked through the consent
 * screen, holding a token that can read their bills until they cut it off.
 *
 * Lives on the sessions page next to browsers on purpose: to the person reading
 * it, "Chrome on my laptop" and "Claude" are the same kind of thing — something
 * that can see the account — and separating them would mean revoking access is
 * two pages instead of one. */
export function ConnectedApps({
  help,
  card,
  meta,
}: {
  help: string;
  card: string;
  meta: string;
}) {
  const { t, locale } = useI18n();
  const tc = t.sessions.apps;
  const { opts } = useToast();
  const utils = trpc.useUtils();

  const list = trpc.sessions.apps.useQuery();
  const revoke = trpc.sessions.revokeApp.useMutation({
    onSuccess: () => utils.sessions.apps.invalidate(),
  });

  const [revoking, setRevoking] = useState<{ id: string; name: string } | null>(
    null,
  );

  const rows = list.data ?? [];

  return (
    <>
      <h2 className="mt-10 mb-1">
        <Eyebrow>{tc.eyebrow}</Eyebrow>
      </h2>
      <p className={help}>{tc.help}</p>

      {list.isPending ? (
        <div className={card} aria-busy="true" aria-label={tc.loading}>
          <Bone chars={16} className="font-display text-lg" />
          <p className={meta}>
            <Bone chars={28} />
          </p>
        </div>
      ) : rows.length === 0 ? (
        <p className={`${meta} mb-3`}>{tc.empty}</p>
      ) : (
        rows.map((app) => (
          <div key={app.id} className={card}>
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="font-display font-semibold text-[15px] tracking-tight">
                {app.name}
              </span>
              <Button
                variant="ghost"
                className="ml-auto"
                disabled={revoke.isPending}
                onClick={() => setRevoking({ id: app.id, name: app.name })}
              >
                {tc.disconnect}
              </Button>
            </div>
            <p className={meta}>{tc.canRead}</p>
            <p className={meta}>
              {interpolate(t.sessions.lastActive, {
                when: formatRelativeTime(app.lastUsedAt, locale),
              })}
              {" · "}
              {interpolate(tc.connectedOn, {
                date: formatDate(app.createdAt, locale),
              })}
            </p>
          </div>
        ))
      )}

      <ConfirmDialog
        open={revoking !== null}
        eyebrow={tc.confirm.eyebrow}
        title={tc.confirm.title}
        description={interpolate(tc.confirm.description, {
          app: revoking?.name ?? "",
        })}
        confirmLabel={tc.disconnect}
        busy={revoke.isPending}
        onCancel={() => setRevoking(null)}
        onConfirm={() => {
          if (!revoking) return;
          revoke.mutate({ id: revoking.id }, opts(tc.toastRevoked));
          setRevoking(null);
        }}
      />
    </>
  );
}

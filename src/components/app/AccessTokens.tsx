"use client";

import { useState } from "react";
import { Eyebrow } from "@/components/charts/primitives";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Bone, Button, Input, Select } from "@/components/ui";
import { interpolate } from "@/i18n/config";
import { useI18n } from "@/i18n/I18nProvider";
import { formatDate, formatRelativeTime } from "@/lib/format";
import { useToast } from "@/lib/toast";
import { trpc } from "@/lib/trpc";

/** Hand-made access tokens, for MCP clients that can only send a fixed
 * Authorization header — a config file, a script, an editor without an OAuth
 * flow.
 *
 * The whole design turns on one fact: the token is shown exactly once. It is
 * stored as a digest, so there is no "show it again" to build, and the UI has
 * to make that obvious at the moment of creation rather than let someone
 * discover it by navigating away. Hence the reveal panel below, which stays put
 * until dismissed and says plainly that this is the only viewing. */
const EXPIRY_CHOICES = [30, 90, 365, null] as const;

/** The literal union the router accepts, derived from the choices offered here
 * so the two cannot drift into a runtime rejection. */
type Expiry = (typeof EXPIRY_CHOICES)[number];

export function AccessTokens({
  help,
  card,
  meta,
}: {
  help: string;
  card: string;
  meta: string;
}) {
  const { t, locale } = useI18n();
  const tt = t.sessions.tokens;
  const { opts, showToast, error } = useToast();
  const utils = trpc.useUtils();

  const list = trpc.sessions.tokens.useQuery();
  const [name, setName] = useState("");
  const [expiresInDays, setExpiresInDays] = useState<Expiry>(90);
  /** The one-time reveal. Held in state, never re-fetchable. */
  const [fresh, setFresh] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<{ id: string; name: string } | null>(
    null,
  );

  const create = trpc.sessions.createToken.useMutation({
    onSuccess: (result) => {
      setFresh(result.token);
      setName("");
      utils.sessions.tokens.invalidate();
    },
    onError: error,
  });
  const revoke = trpc.sessions.revokeToken.useMutation({
    onSuccess: () => utils.sessions.tokens.invalidate(),
  });

  const rows = list.data ?? [];

  const copy = async () => {
    if (!fresh) return;
    try {
      await navigator.clipboard.writeText(fresh);
      showToast(tt.copied);
    } catch {
      // Clipboard access is refused in some contexts (no HTTPS, permissions).
      // The token is on screen and selectable, so this is a nudge, not a
      // failure — and definitely not a reason to lose the value.
      showToast(tt.copyFailed);
    }
  };

  const expiryLabel = (days: number | null) =>
    days === null ? tt.expiryNever : interpolate(tt.expiryDays, { days });

  return (
    <>
      <h2 className="mt-10 mb-1">
        <Eyebrow>{tt.eyebrow}</Eyebrow>
      </h2>
      <p className={help}>{tt.help}</p>

      {fresh && (
        <div className="border border-accent bg-card p-[18px] mb-3">
          <Eyebrow tone="accent">{tt.reveal.eyebrow}</Eyebrow>
          <p className="font-mono text-xs break-all mt-2 leading-[1.6]">
            {fresh}
          </p>
          <p className={`${meta} mt-2`}>{tt.reveal.onlyOnce}</p>
          <div className="flex gap-2 mt-3">
            <Button variant="solid" onClick={copy}>
              {tt.reveal.copy}
            </Button>
            <Button variant="outline" onClick={() => setFresh(null)}>
              {tt.reveal.done}
            </Button>
          </div>
        </div>
      )}

      <form
        className="flex flex-wrap items-end gap-2 mb-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!name.trim()) return;
          create.mutate({ name: name.trim(), expiresInDays });
        }}
      >
        <label className="flex-1 min-w-[180px]">
          <span className="font-mono text-micro uppercase tracking-label text-muted block mb-1">
            {tt.nameLabel}
          </span>
          <Input
            value={name}
            maxLength={60}
            placeholder={tt.namePlaceholder}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label>
          <span className="font-mono text-micro uppercase tracking-label text-muted block mb-1">
            {tt.expiryLabel}
          </span>
          <Select
            value={String(expiresInDays)}
            onChange={(event) =>
              setExpiresInDays(
                event.target.value === "null"
                  ? null
                  : (Number(event.target.value) as Expiry),
              )
            }
          >
            {EXPIRY_CHOICES.map((days) => (
              <option key={String(days)} value={String(days)}>
                {expiryLabel(days)}
              </option>
            ))}
          </Select>
        </label>
        <Button type="submit" disabled={!name.trim() || create.isPending}>
          {tt.create}
        </Button>
      </form>

      {list.isPending ? (
        <div className={card} aria-busy="true" aria-label={tt.loading}>
          <Bone chars={14} className="font-display text-lg" />
          <p className={meta}>
            <Bone chars={24} />
          </p>
        </div>
      ) : rows.length === 0 ? (
        <p className={meta}>{tt.empty}</p>
      ) : (
        rows.map((token) => (
          <div key={token.id} className={card}>
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="font-display font-semibold text-[15px] tracking-tight">
                {token.name}
              </span>
              <span className="font-mono text-micro text-muted">
                ····{token.hint}
              </span>
              <Button
                variant="ghost"
                className="ml-auto"
                disabled={revoke.isPending}
                onClick={() => setRevoking({ id: token.id, name: token.name })}
              >
                {t.sessions.revoke}
              </Button>
            </div>
            <p className={meta}>
              {token.lastUsedAt
                ? interpolate(t.sessions.lastActive, {
                    when: formatRelativeTime(token.lastUsedAt, locale),
                  })
                : tt.neverUsed}
              {" · "}
              {token.expires
                ? interpolate(tt.expiresOn, {
                    date: formatDate(token.expires, locale),
                  })
                : tt.noExpiry}
            </p>
          </div>
        ))
      )}

      <ConfirmDialog
        open={revoking !== null}
        eyebrow={tt.confirm.eyebrow}
        title={tt.confirm.title}
        description={interpolate(tt.confirm.description, {
          name: revoking?.name ?? "",
        })}
        confirmLabel={t.sessions.revoke}
        busy={revoke.isPending}
        onCancel={() => setRevoking(null)}
        onConfirm={() => {
          if (!revoking) return;
          revoke.mutate({ id: revoking.id }, opts(tt.toastRevoked));
          setRevoking(null);
        }}
      />
    </>
  );
}

"use client";

import { useSession } from "next-auth/react";
import { useMemo, useState } from "react";
import posthog from "posthog-js";
import { Display, Eyebrow } from "@/components/charts/primitives";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Button, Checkbox, Input, Select } from "@/components/ui";
import { VendorColorPicker } from "@/components/VendorColorPicker";
import { interpolate } from "@/i18n/config";
import { useI18n } from "@/i18n/I18nProvider";
import { cn } from "@/lib/cn";
import { OWNED_PROPERTY_LIMIT } from "@/lib/limits";
import type { VendorColorName } from "@/lib/vendorColors";
import { useToast } from "@/lib/toast";
import { trpc } from "@/lib/trpc";

const help =
  "font-mono text-xs text-muted mb-[14px] max-w-[540px] leading-[1.6]";
const card = "border border-line bg-card p-[18px] mb-4";
const subhead =
  "font-mono text-[10px] uppercase tracking-[0.16em] text-muted mt-[18px] mb-2";
const row =
  "flex flex-wrap items-center gap-2.5 py-2 border-t border-dashed border-line";
const iconX =
  "ml-auto bg-transparent border-none text-muted cursor-pointer transition-colors hover:text-accent";

export default function PropertiesPage() {
  const { data: session } = useSession();
  const { showToast, error: toastErr, opts } = useToast();
  const { t } = useI18n();
  const tp = t.properties;
  const roleLabel = (role: string) =>
    tp.roles[role as keyof typeof tp.roles] ?? role;
  const utils = trpc.useUtils();

  const properties = trpc.properties.list.useQuery();
  const pendingInvites = trpc.properties.pendingInvites.useQuery();
  const vendors = trpc.vendors.list.useQuery();
  const vendorAliases = trpc.vendors.aliases.useQuery();
  const accounts = trpc.accounts.list.useQuery();

  const invalidate = () => utils.invalidate();

  const createApt = trpc.properties.create.useMutation({
    onSuccess: () => {
      posthog.capture("property_created");
      invalidate();
    },
  });
  const updateApt = trpc.properties.update.useMutation({
    onSuccess: invalidate,
  });
  const deleteApt = trpc.properties.delete.useMutation({
    onSuccess: invalidate,
  });
  const invite = trpc.properties.invite.useMutation({
    onSuccess: () => {
      posthog.capture("member_invited");
      invalidate();
    },
  });
  const revokeInvite = trpc.properties.revokeInvite.useMutation({
    onSuccess: invalidate,
  });
  const removeMember = trpc.properties.removeMember.useMutation({
    onSuccess: invalidate,
  });
  const leave = trpc.properties.leave.useMutation({ onSuccess: invalidate });
  const acceptInvite = trpc.properties.acceptInvite.useMutation({
    onSuccess: () => {
      posthog.capture("invite_accepted");
      invalidate();
    },
  });
  const declineInvite = trpc.properties.declineInvite.useMutation({
    onSuccess: invalidate,
  });
  const updateVendor = trpc.vendors.update.useMutation({
    onSuccess: invalidate,
  });
  const mergeVendors = trpc.vendors.merge.useMutation({
    onSuccess: () => {
      posthog.capture("vendors_merged");
      invalidate();
    },
  });
  const unlinkAlias = trpc.vendors.unlinkAlias.useMutation({
    onSuccess: invalidate,
  });
  const updateAccount = trpc.accounts.update.useMutation({
    onSuccess: invalidate,
  });
  const mergeAccounts = trpc.accounts.merge.useMutation({
    onSuccess: () => {
      posthog.capture("accounts_merged");
      invalidate();
    },
  });
  const deleteAccount = trpc.accounts.delete.useMutation({
    onSuccess: invalidate,
  });

  const [newNickname, setNewNickname] = useState("");
  const [deletingApt, setDeletingApt] = useState<{
    id: string;
    nickname: string;
  } | null>(null);
  const [showLimitDialog, setShowLimitDialog] = useState(false);
  const myEmail = session?.user?.email?.toLowerCase() ?? "";

  const ownedCount = useMemo(
    () => (properties.data ?? []).filter((a) => a.role === "owner").length,
    [properties.data],
  );
  const atLimit = ownedCount >= OWNED_PROPERTY_LIMIT;

  return (
    <div className="mx-auto max-w-[52rem] px-5 pt-8 pb-20">
      <Eyebrow>{tp.eyebrow}</Eyebrow>
      <Display size={34} className="block mt-1.5">
        {tp.title}
      </Display>
      <p className={`${help} mt-[14px]`}>
        {interpolate(tp.help, { limit: OWNED_PROPERTY_LIMIT })}
      </p>

      {/* pending invitations addressed to this user */}
      {(pendingInvites.data ?? []).length > 0 && (
        <div className={card}>
          <p className={subhead + " mt-0"}>{tp.pendingInvitations}</p>
          {(pendingInvites.data ?? []).map((inv) => (
            <div key={inv.id} className={row}>
              <span className="font-mono text-[13px] font-medium">
                {inv.property}
              </span>
              <span className="font-mono text-micro text-muted">
                {interpolate(tp.sharedBy, {
                  inviter: inv.inviter,
                  role: roleLabel(inv.role),
                })}
              </span>
              <div className="ml-auto flex gap-2">
                <Button
                  variant="outline"
                  onClick={() =>
                    acceptInvite.mutate(
                      { id: inv.id },
                      opts(tp.toastInviteAccepted),
                    )
                  }
                >
                  {tp.accept}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() =>
                    declineInvite.mutate(
                      { id: inv.id },
                      opts(tp.toastInviteDeclined),
                    )
                  }
                >
                  {tp.decline}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {(properties.data ?? []).map((apt) => {
        const isOwner = apt.role === "owner";
        const aptVendors = (vendors.data ?? []).filter(
          (v) => v.propertyId === apt.id,
        );
        const aptAccounts = (accounts.data ?? []).filter(
          (a) => a.propertyId === apt.id,
        );
        const vendorName = (id: string) =>
          aptVendors.find((v) => v.id === id)?.displayName ?? "—";

        return (
          <div key={apt.id} className={card}>
            {/* header */}
            <div className="flex items-center gap-3 flex-wrap">
              {isOwner ? (
                <Input
                  defaultValue={apt.nickname}
                  onBlur={(e) => {
                    if (
                      e.target.value.trim() &&
                      e.target.value !== apt.nickname
                    )
                      updateApt.mutate({
                        id: apt.id,
                        nickname: e.target.value.trim(),
                      });
                  }}
                  className="w-[180px] font-semibold text-base"
                />
              ) : (
                <span className="font-display font-semibold text-lg">
                  {apt.nickname}
                </span>
              )}
              <span
                className={cn(
                  "font-mono text-[10px] uppercase tracking-[0.14em] border border-line py-0.5 px-2",
                  isOwner ? "text-accent" : "text-muted",
                )}
              >
                {roleLabel(apt.role)}
              </span>
              <div className="ml-auto flex gap-2">
                {isOwner ? (
                  <Button
                    variant="ghost"
                    onClick={() =>
                      setDeletingApt({ id: apt.id, nickname: apt.nickname })
                    }
                  >
                    {t.common.delete}
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    onClick={() =>
                      leave.mutate({ propertyId: apt.id }, opts(tp.toastLeft))
                    }
                  >
                    {tp.leave}
                  </Button>
                )}
              </div>
            </div>

            {/* address (owner) */}
            {isOwner && (
              <Input
                defaultValue={apt.address}
                placeholder={tp.addressPlaceholder}
                onBlur={(e) => {
                  const address = e.target.value.trim();
                  if (address !== apt.address)
                    updateApt.mutate({ id: apt.id, address });
                }}
                className="mt-2.5"
              />
            )}

            {/* members */}
            <p className={subhead}>{tp.people}</p>
            {apt.members.map((m) => (
              <div key={m.userId} className={row}>
                <span className="font-mono text-[13px] font-medium">
                  {m.name ?? m.email}
                  {m.email.toLowerCase() === myEmail && (
                    <span className="text-muted">{tp.you}</span>
                  )}
                </span>
                <span className="font-mono text-micro text-muted">
                  {interpolate(tp.memberInfo, {
                    email: m.email,
                    role: roleLabel(m.role),
                  })}
                </span>
                {isOwner && m.email.toLowerCase() !== myEmail && (
                  <button
                    aria-label={tp.removeAria}
                    onClick={() =>
                      removeMember.mutate(
                        { propertyId: apt.id, userId: m.userId },
                        opts(tp.toastMemberRemoved),
                      )
                    }
                    className={iconX}
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
            {apt.invites.map((inv) => (
              <div key={inv.id} className={row}>
                <span className="font-mono text-[13px]">{inv.email}</span>
                <span className="font-mono text-micro text-accent">
                  {tp.invitedPending}
                </span>
                {isOwner && (
                  <button
                    aria-label={tp.revokeAria}
                    onClick={() =>
                      revokeInvite.mutate(
                        { id: inv.id },
                        opts(tp.toastInviteRevoked),
                      )
                    }
                    className={iconX}
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
            {isOwner && (
              <InviteForm
                onInvite={(email) =>
                  invite.mutate(
                    { propertyId: apt.id, email },
                    opts(tp.toastInviteSent),
                  )
                }
              />
            )}

            {/* vendors */}
            {aptVendors.length > 0 && (
              <>
                <p className={subhead}>{tp.vendors}</p>
                {isOwner && aptVendors.length > 1 && (
                  <p className={help}>{tp.mergeVendorHelp}</p>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {aptVendors.map((v) => (
                    <VendorCell
                      key={v.id}
                      vendor={v}
                      others={aptVendors.filter((o) => o.id !== v.id)}
                      aliases={(vendorAliases.data ?? []).filter(
                        (a) => a.vendorId === v.id,
                      )}
                      isOwner={isOwner}
                      onColor={(color) =>
                        updateVendor.mutate({ id: v.id, color })
                      }
                      onRename={(displayName) =>
                        updateVendor.mutate({ id: v.id, displayName })
                      }
                      onMerge={(targetId) =>
                        mergeVendors.mutate(
                          { sourceId: v.id, targetId },
                          opts(tp.toastVendorsMerged),
                        )
                      }
                      onUnlinkAlias={(id) =>
                        unlinkAlias.mutate({ id }, { onError: toastErr })
                      }
                    />
                  ))}
                </div>
              </>
            )}

            {/* accounts */}
            {aptAccounts.length > 0 && (
              <>
                <p className={subhead}>{tp.accounts}</p>
                {aptAccounts.map((a) => (
                  <AccountRow
                    key={a.id}
                    account={a}
                    vendorName={vendorName(a.vendorId)}
                    // Only accounts of the SAME vendor can merge: two numbers
                    // under one biller is the split we're undoing; two vendors
                    // is what the vendor merge above is for.
                    siblings={aptAccounts.filter(
                      (o) => o.id !== a.id && o.vendorId === a.vendorId,
                    )}
                    isOwner={isOwner}
                    onToggleActive={(active) =>
                      updateAccount.mutate({ id: a.id, active })
                    }
                    onMerge={(targetId) =>
                      mergeAccounts.mutate(
                        { sourceId: a.id, targetId },
                        opts(tp.toastAccountsMerged),
                      )
                    }
                    onDelete={() =>
                      deleteAccount.mutate({ id: a.id }, { onError: toastErr })
                    }
                  />
                ))}
              </>
            )}
          </div>
        );
      })}

      {/* add property */}
      <div className="flex flex-wrap gap-3 mt-2">
        <Input
          value={newNickname}
          onChange={(e) => setNewNickname(e.target.value)}
          placeholder={tp.newPropertyPlaceholder}
          className="w-[220px]"
        />
        <Button
          variant="outline"
          disabled={createApt.isPending}
          onClick={() => {
            if (atLimit) {
              posthog.capture("property_limit_reached", {
                email: myEmail || undefined,
                owned_count: ownedCount,
                limit: OWNED_PROPERTY_LIMIT,
              });
              setShowLimitDialog(true);
              return;
            }
            if (!newNickname.trim()) return;
            createApt.mutate(
              { nickname: newNickname.trim(), address: "" },
              opts(tp.toastAdded),
            );
            setNewNickname("");
          }}
        >
          {tp.addProperty}
        </Button>
      </div>

      <ConfirmDialog
        open={!!deletingApt}
        eyebrow={tp.deleteEyebrow}
        title={t.common.cantUndo}
        description={
          deletingApt ? (
            <>
              <span className="font-semibold text-ink">
                {deletingApt.nickname}
              </span>{" "}
              {tp.deleteDescSuffix}
            </>
          ) : null
        }
        confirmLabel={tp.deleteConfirm}
        busyLabel={t.billDrawer.deleting}
        busy={deleteApt.isPending}
        onConfirm={() => {
          if (!deletingApt) return;
          deleteApt.mutate(
            { id: deletingApt.id },
            {
              onSuccess: () => {
                showToast(tp.toastRemoved);
                setDeletingApt(null);
              },
              onError: (err) => {
                toastErr(err);
                setDeletingApt(null);
              },
            },
          );
        }}
        onCancel={() => setDeletingApt(null)}
      />

      <ConfirmDialog
        open={showLimitDialog}
        eyebrow={tp.limitEyebrow}
        title={interpolate(tp.limitTitle, { limit: OWNED_PROPERTY_LIMIT })}
        description={tp.limitDesc}
        confirmLabel={tp.limitNotify}
        cancelLabel={tp.limitDismiss}
        onConfirm={() => {
          posthog.capture("property_limit_notify_clicked", {
            email: myEmail || undefined,
            owned_count: ownedCount,
            limit: OWNED_PROPERTY_LIMIT,
          });
          setShowLimitDialog(false);
          showToast(tp.limitToastThanks);
        }}
        onCancel={() => setShowLimitDialog(false)}
      />
    </div>
  );
}

/** One vendor: colour, name, the other slugs it answers to, and — the reason
 * this cell exists — the way to fold a duplicate of the same biller into it.
 * Renaming both rows to match is what people try first and it changes nothing,
 * because every screen groups by vendor id. */
function VendorCell({
  vendor,
  others,
  aliases,
  isOwner,
  onColor,
  onRename,
  onMerge,
  onUnlinkAlias,
}: {
  vendor: { id: string; displayName: string; color: string };
  others: { id: string; displayName: string }[];
  aliases: { id: string; slug: string }[];
  isOwner: boolean;
  onColor: (color: VendorColorName) => void;
  onRename: (displayName: string) => void;
  onMerge: (targetId: string) => void;
  onUnlinkAlias: (id: string) => void;
}) {
  const { t } = useI18n();
  const tp = t.properties;
  const [merging, setMerging] = useState(false);
  const [targetId, setTargetId] = useState("");

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <VendorColorPicker
          value={vendor.color}
          onChange={isOwner ? onColor : undefined}
        />
        {isOwner ? (
          <Input
            defaultValue={vendor.displayName}
            onBlur={(e) => {
              if (
                e.target.value.trim() &&
                e.target.value !== vendor.displayName
              )
                onRename(e.target.value.trim());
            }}
            className="flex-1 font-semibold"
          />
        ) : (
          <span className="flex-1 font-mono text-[13px] font-semibold">
            {vendor.displayName}
          </span>
        )}
        {isOwner && others.length > 0 && !merging && (
          <button
            onClick={() => setMerging(true)}
            className="font-mono text-micro uppercase tracking-[0.14em] text-muted bg-transparent border-none cursor-pointer transition-colors hover:text-accent"
          >
            {tp.merge}
          </button>
        )}
      </div>

      {merging && (
        <div className="flex items-center gap-2 pl-7">
          <Select
            value={targetId}
            onChange={(e) => setTargetId(e.target.value)}
            className="flex-1"
          >
            <option value="">{tp.mergeIntoPlaceholder}</option>
            {others.map((o) => (
              <option key={o.id} value={o.id}>
                {o.displayName}
              </option>
            ))}
          </Select>
          <Button
            variant="outline"
            disabled={!targetId}
            onClick={() => {
              onMerge(targetId);
              setMerging(false);
              setTargetId("");
            }}
          >
            {tp.merge}
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              setMerging(false);
              setTargetId("");
            }}
          >
            {t.common.cancel}
          </Button>
        </div>
      )}

      {aliases.length > 0 && (
        <p className="flex flex-wrap items-center gap-1.5 pl-7 font-mono text-micro text-muted">
          <span>{tp.alsoKnownAs}</span>
          {aliases.map((a) => (
            <span key={a.id} className="border border-line px-1.5 py-0.5">
              {a.slug}
              {isOwner && (
                <button
                  aria-label={tp.unlinkAliasAria}
                  onClick={() => onUnlinkAlias(a.id)}
                  className="ml-1 bg-transparent border-none text-muted cursor-pointer transition-colors hover:text-accent"
                >
                  ✕
                </button>
              )}
            </span>
          ))}
        </p>
      )}
    </div>
  );
}

/** One account number under a vendor. `siblings` are the other accounts of the
 * SAME vendor — the second row a parser upgrade leaves behind when the identity
 * it reads off the bill changes shape. */
function AccountRow({
  account,
  vendorName,
  siblings,
  isOwner,
  onToggleActive,
  onMerge,
  onDelete,
}: {
  account: { id: string; accountNumber: string; active: boolean };
  vendorName: string;
  siblings: { id: string; accountNumber: string }[];
  isOwner: boolean;
  onToggleActive: (active: boolean) => void;
  onMerge: (targetId: string) => void;
  onDelete: () => void;
}) {
  const { t } = useI18n();
  const tp = t.properties;
  const [merging, setMerging] = useState(false);
  const [targetId, setTargetId] = useState("");

  return (
    <div className={row}>
      <span className="w-[130px] font-mono font-semibold text-[13px]">
        {vendorName}
      </span>
      <span className="font-mono text-xs text-muted">
        №{account.accountNumber}
      </span>
      {isOwner && !merging && (
        <Checkbox
          label={tp.expectedMonthly}
          checked={account.active}
          onChange={(e) => onToggleActive(e.target.checked)}
        />
      )}
      {isOwner && merging && (
        <>
          <Select
            value={targetId}
            onChange={(e) => setTargetId(e.target.value)}
            className="max-w-[220px]"
          >
            <option value="">{tp.mergeIntoPlaceholder}</option>
            {siblings.map((s) => (
              <option key={s.id} value={s.id}>
                №{s.accountNumber}
              </option>
            ))}
          </Select>
          <Button
            variant="outline"
            disabled={!targetId}
            onClick={() => {
              onMerge(targetId);
              setMerging(false);
              setTargetId("");
            }}
          >
            {tp.merge}
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              setMerging(false);
              setTargetId("");
            }}
          >
            {t.common.cancel}
          </Button>
        </>
      )}
      {isOwner && siblings.length > 0 && !merging && (
        <button
          onClick={() => setMerging(true)}
          className="font-mono text-micro uppercase tracking-[0.14em] text-muted bg-transparent border-none cursor-pointer transition-colors hover:text-accent"
        >
          {tp.merge}
        </button>
      )}
      {isOwner && !merging && (
        <button aria-label={tp.deleteAria} onClick={onDelete} className={iconX}>
          ✕
        </button>
      )}
    </div>
  );
}

function InviteForm({ onInvite }: { onInvite: (email: string) => void }) {
  const [email, setEmail] = useState("");
  const { t } = useI18n();
  return (
    <form
      className="flex gap-2 mt-2.5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!email.trim()) return;
        onInvite(email.trim());
        setEmail("");
      }}
    >
      <Input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder={t.properties.invitePlaceholder}
        className="flex-1 max-w-[280px]"
      />
      <Button type="submit" variant="outline">
        {t.properties.invite}
      </Button>
    </form>
  );
}

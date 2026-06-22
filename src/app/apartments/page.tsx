"use client";

import { useSession } from "next-auth/react";
import { useMemo, useState } from "react";
import { useApp } from "@/components/app/context";
import { Display, Eyebrow } from "@/components/charts/primitives";
import { Button, Checkbox, Input } from "@/components/ui";
import { VendorColorPicker } from "@/components/VendorColorPicker";
import { cn } from "@/lib/cn";
import { OWNED_APARTMENT_LIMIT } from "@/lib/limits";
import { trpc } from "@/lib/trpc";

const help = "font-mono text-xs text-muted mb-[14px] max-w-[540px] leading-[1.6]";
const card = "border border-line bg-card p-[18px] mb-4";
const subhead =
  "font-mono text-[10px] uppercase tracking-[0.16em] text-muted mt-[18px] mb-2";
const row =
  "flex flex-wrap items-center gap-2.5 py-2 border-t border-dashed border-line";
const iconX =
  "ml-auto bg-transparent border-none text-muted cursor-pointer transition-colors hover:text-accent";

export default function ApartmentsPage() {
  const { data: session } = useSession();
  const { showToast } = useApp();
  const utils = trpc.useUtils();

  const apartments = trpc.properties.list.useQuery();
  const pendingInvites = trpc.properties.pendingInvites.useQuery();
  const vendors = trpc.vendors.list.useQuery();
  const accounts = trpc.accounts.list.useQuery();

  const invalidate = () => utils.invalidate();
  const toastErr = (err: { message: string }) => showToast(`✕ ${err.message}`);

  const createApt = trpc.properties.create.useMutation({ onSuccess: invalidate });
  const updateApt = trpc.properties.update.useMutation({ onSuccess: invalidate });
  const deleteApt = trpc.properties.delete.useMutation({ onSuccess: invalidate });
  const invite = trpc.properties.invite.useMutation({ onSuccess: invalidate });
  const revokeInvite = trpc.properties.revokeInvite.useMutation({ onSuccess: invalidate });
  const removeMember = trpc.properties.removeMember.useMutation({ onSuccess: invalidate });
  const leave = trpc.properties.leave.useMutation({ onSuccess: invalidate });
  const acceptInvite = trpc.properties.acceptInvite.useMutation({ onSuccess: invalidate });
  const declineInvite = trpc.properties.declineInvite.useMutation({ onSuccess: invalidate });
  const updateVendor = trpc.vendors.update.useMutation({ onSuccess: invalidate });
  const updateAccount = trpc.accounts.update.useMutation({ onSuccess: invalidate });
  const deleteAccount = trpc.accounts.delete.useMutation({ onSuccess: invalidate });

  const [newNickname, setNewNickname] = useState("");
  const myEmail = session?.user?.email?.toLowerCase() ?? "";

  const ownedCount = useMemo(
    () => (apartments.data ?? []).filter((a) => a.role === "owner").length,
    [apartments.data],
  );
  const atLimit = ownedCount >= OWNED_APARTMENT_LIMIT;

  const parseVariants = (s: string) =>
    s.split(",").map((x) => x.trim()).filter((x) => x.length >= 4);

  return (
    <div className="mx-auto max-w-[52rem] px-5 pt-8 pb-20">
      <Eyebrow>Apartments</Eyebrow>
      <Display size={34} className="block mt-1.5">
        Your apartments
      </Display>
      <p className={`${help} mt-[14px]`}>
        Each apartment holds its own bills, vendors and accounts. Invite someone
        (a partner, a flatmate) and they&rsquo;ll see and add bills here too. You
        can own up to {OWNED_APARTMENT_LIMIT} apartments; ones shared with you
        don&rsquo;t count.
      </p>

      {/* pending invitations addressed to this user */}
      {(pendingInvites.data ?? []).length > 0 && (
        <div className={card}>
          <p className={subhead + " mt-0"}>Pending invitations</p>
          {(pendingInvites.data ?? []).map((inv) => (
            <div key={inv.id} className={row}>
              <span className="font-mono text-[13px] font-medium">
                {inv.property}
              </span>
              <span className="font-mono text-micro text-muted">
                shared by {inv.inviter} · {inv.role}
              </span>
              <div className="ml-auto flex gap-2">
                <Button
                  variant="outline"
                  onClick={() =>
                    acceptInvite.mutate(
                      { id: inv.id },
                      { onSuccess: () => showToast("Invitation accepted"), onError: toastErr },
                    )
                  }
                >
                  Accept
                </Button>
                <Button
                  variant="ghost"
                  onClick={() =>
                    declineInvite.mutate(
                      { id: inv.id },
                      { onSuccess: () => showToast("Invitation declined"), onError: toastErr },
                    )
                  }
                >
                  Decline
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {(apartments.data ?? []).map((apt) => {
        const isOwner = apt.role === "owner";
        const aptVendors = (vendors.data ?? []).filter((v) => v.propertyId === apt.id);
        const aptAccounts = (accounts.data ?? []).filter((a) => a.propertyId === apt.id);
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
                    if (e.target.value.trim() && e.target.value !== apt.nickname)
                      updateApt.mutate({ id: apt.id, nickname: e.target.value.trim() });
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
                {apt.role}
              </span>
              <div className="ml-auto flex gap-2">
                {isOwner ? (
                  <Button
                    variant="ghost"
                    onClick={() =>
                      deleteApt.mutate(
                        { id: apt.id },
                        {
                          onSuccess: () => showToast("Apartment removed"),
                          onError: toastErr,
                        },
                      )
                    }
                  >
                    Delete
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    onClick={() =>
                      leave.mutate(
                        { propertyId: apt.id },
                        { onSuccess: () => showToast("Left apartment"), onError: toastErr },
                      )
                    }
                  >
                    Leave
                  </Button>
                )}
              </div>
            </div>

            {/* address variants (owner) */}
            {isOwner && (
              <Input
                defaultValue={apt.addressVariants.join(", ")}
                placeholder="Address variants, comma-separated (street + number)"
                onBlur={(e) =>
                  updateApt.mutate({ id: apt.id, addressVariants: parseVariants(e.target.value) })
                }
                className="mt-2.5"
              />
            )}

            {/* members */}
            <p className={subhead}>People</p>
            {apt.members.map((m) => (
              <div key={m.userId} className={row}>
                <span className="font-mono text-[13px] font-medium">
                  {m.name ?? m.email}
                  {m.email.toLowerCase() === myEmail && (
                    <span className="text-muted"> · you</span>
                  )}
                </span>
                <span className="font-mono text-micro text-muted">
                  {m.email} · {m.role}
                </span>
                {isOwner && m.email.toLowerCase() !== myEmail && (
                  <button
                    aria-label="Remove"
                    onClick={() =>
                      removeMember.mutate(
                        { propertyId: apt.id, userId: m.userId },
                        { onSuccess: () => showToast("Member removed"), onError: toastErr },
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
                  invited · pending
                </span>
                {isOwner && (
                  <button
                    aria-label="Revoke"
                    onClick={() =>
                      revokeInvite.mutate(
                        { id: inv.id },
                        { onSuccess: () => showToast("Invite revoked"), onError: toastErr },
                      )
                    }
                    className={iconX}
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
            {isOwner && <InviteForm onInvite={(email) => invite.mutate(
              { propertyId: apt.id, email },
              { onSuccess: () => showToast("Invitation sent"), onError: toastErr },
            )} />}

            {/* vendors */}
            {aptVendors.length > 0 && (
              <>
                <p className={subhead}>Vendors</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {aptVendors.map((v) => (
                    <div key={v.id} className="flex items-center gap-2">
                      <VendorColorPicker
                        value={v.color}
                        onChange={
                          isOwner
                            ? (color) => updateVendor.mutate({ id: v.id, color })
                            : undefined
                        }
                      />
                      {isOwner ? (
                        <Input
                          defaultValue={v.displayName}
                          onBlur={(e) => {
                            if (e.target.value.trim() && e.target.value !== v.displayName)
                              updateVendor.mutate({ id: v.id, displayName: e.target.value.trim() });
                          }}
                          className="flex-1 font-semibold"
                        />
                      ) : (
                        <span className="flex-1 font-mono text-[13px] font-semibold">
                          {v.displayName}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* accounts */}
            {aptAccounts.length > 0 && (
              <>
                <p className={subhead}>Accounts</p>
                {aptAccounts.map((a) => (
                  <div key={a.id} className={row}>
                    <span className="w-[130px] font-mono font-semibold text-[13px]">
                      {vendorName(a.vendorId)}
                    </span>
                    <span className="font-mono text-xs text-muted">
                      №{a.accountNumber}
                    </span>
                    {isOwner && (
                      <Checkbox
                        label="expected monthly"
                        checked={a.active}
                        onChange={(e) => updateAccount.mutate({ id: a.id, active: e.target.checked })}
                      />
                    )}
                    {isOwner && (
                      <button
                        aria-label="Delete"
                        onClick={() =>
                          deleteAccount.mutate(
                            { id: a.id },
                            { onError: toastErr },
                          )
                        }
                        className={iconX}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
              </>
            )}
          </div>
        );
      })}

      {/* add apartment */}
      <div className="flex flex-wrap gap-3 mt-2">
        <Input
          value={newNickname}
          onChange={(e) => setNewNickname(e.target.value)}
          placeholder="New apartment nickname"
          disabled={atLimit}
          className="w-[220px]"
        />
        <Button
          variant="outline"
          disabled={atLimit || createApt.isPending}
          onClick={() => {
            if (!newNickname.trim()) return;
            createApt.mutate(
              { nickname: newNickname.trim(), addressVariants: [] },
              { onSuccess: () => showToast("Apartment added"), onError: toastErr },
            );
            setNewNickname("");
          }}
        >
          Add apartment
        </Button>
        {atLimit && (
          <span className="font-mono text-micro text-muted self-center">
            You&rsquo;ve reached the limit of {OWNED_APARTMENT_LIMIT} owned apartments.
          </span>
        )}
      </div>
    </div>
  );
}

function InviteForm({ onInvite }: { onInvite: (email: string) => void }) {
  const [email, setEmail] = useState("");
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
        placeholder="Invite by email"
        className="flex-1 max-w-[280px]"
      />
      <Button type="submit" variant="outline">
        Invite
      </Button>
    </form>
  );
}

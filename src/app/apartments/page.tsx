"use client";

import { useSession } from "next-auth/react";
import { type CSSProperties, useMemo, useState } from "react";
import { useApp } from "@/components/app/context";
import { Display, Eyebrow } from "@/components/charts/primitives";
import { Button, Checkbox, Input } from "@/components/ui";
import { OWNED_APARTMENT_LIMIT } from "@/lib/limits";
import { FALLBACK_COLOR, vendorColorMap } from "@/lib/vendorColors";
import { trpc } from "@/lib/trpc";

export default function ApartmentsPage() {
  const { data: session } = useSession();
  const { showToast } = useApp();
  const utils = trpc.useUtils();

  const apartments = trpc.properties.list.useQuery();
  const vendors = trpc.vendors.list.useQuery();
  const accounts = trpc.accounts.list.useQuery();
  const vendorColors = useMemo(
    () => vendorColorMap(vendors.data ?? []),
    [vendors.data],
  );

  const invalidate = () => utils.invalidate();
  const toastErr = (err: { message: string }) => showToast(`✕ ${err.message}`);

  const createApt = trpc.properties.create.useMutation({ onSuccess: invalidate });
  const updateApt = trpc.properties.update.useMutation({ onSuccess: invalidate });
  const deleteApt = trpc.properties.delete.useMutation({ onSuccess: invalidate });
  const invite = trpc.properties.invite.useMutation({ onSuccess: invalidate });
  const revokeInvite = trpc.properties.revokeInvite.useMutation({ onSuccess: invalidate });
  const removeMember = trpc.properties.removeMember.useMutation({ onSuccess: invalidate });
  const leave = trpc.properties.leave.useMutation({ onSuccess: invalidate });
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

  const help: CSSProperties = {
    fontFamily: "var(--font-mono)",
    fontSize: 12,
    color: "var(--muted)",
    margin: "0 0 14px",
    maxWidth: 540,
    lineHeight: 1.6,
  };
  const card: CSSProperties = {
    border: "1px solid var(--line)",
    background: "var(--card)",
    padding: 18,
    marginBottom: 16,
  };
  const subhead: CSSProperties = {
    fontFamily: "var(--font-mono)",
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: "0.16em",
    color: "var(--muted)",
    margin: "18px 0 8px",
  };
  const row: CSSProperties = {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 10,
    padding: "8px 0",
    borderTop: "1px dashed var(--line)",
  };

  return (
    <div style={{ maxWidth: "52rem", margin: "0 auto", padding: "32px 20px 80px" }}>
      <Eyebrow>Apartments</Eyebrow>
      <Display size={34} style={{ display: "block", marginTop: 6 }}>
        Your apartments
      </Display>
      <p style={{ ...help, marginTop: 14 }}>
        Each apartment holds its own bills, vendors and accounts. Invite someone
        (a partner, a flatmate) and they&rsquo;ll see and add bills here too. You
        can own up to {OWNED_APARTMENT_LIMIT} apartments; ones shared with you
        don&rsquo;t count.
      </p>

      {(apartments.data ?? []).map((apt) => {
        const isOwner = apt.role === "owner";
        const aptVendors = (vendors.data ?? []).filter((v) => v.propertyId === apt.id);
        const aptAccounts = (accounts.data ?? []).filter((a) => a.propertyId === apt.id);
        const vendorName = (id: string) =>
          aptVendors.find((v) => v.id === id)?.displayName ?? "—";

        return (
          <div key={apt.id} style={card}>
            {/* header */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              {isOwner ? (
                <Input
                  defaultValue={apt.nickname}
                  onBlur={(e) => {
                    if (e.target.value.trim() && e.target.value !== apt.nickname)
                      updateApt.mutate({ id: apt.id, nickname: e.target.value.trim() });
                  }}
                  style={{ width: 180, fontWeight: 600, fontSize: 16 }}
                />
              ) : (
                <span style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 18 }}>
                  {apt.nickname}
                </span>
              )}
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 10,
                  textTransform: "uppercase",
                  letterSpacing: "0.14em",
                  color: isOwner ? "var(--accent)" : "var(--muted)",
                  border: "1px solid var(--line)",
                  padding: "2px 8px",
                }}
              >
                {apt.role}
              </span>
              <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
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
                style={{ width: "100%", marginTop: 10 }}
              />
            )}

            {/* members */}
            <p style={subhead}>People</p>
            {apt.members.map((m) => (
              <div key={m.userId} style={row}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 500 }}>
                  {m.name ?? m.email}
                  {m.email.toLowerCase() === myEmail && (
                    <span style={{ color: "var(--muted)" }}> · you</span>
                  )}
                </span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted)" }}>
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
                    className="fx-x"
                    style={{ marginLeft: "auto", background: "none", border: "none", color: "var(--muted)", cursor: "pointer" }}
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
            {apt.invites.map((inv) => (
              <div key={inv.id} style={row}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 13 }}>{inv.email}</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--accent)" }}>
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
                    className="fx-x"
                    style={{ marginLeft: "auto", background: "none", border: "none", color: "var(--muted)", cursor: "pointer" }}
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
                <p style={subhead}>Vendors</p>
                <div className="fx-stack-sm" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  {aptVendors.map((v) => (
                    <div key={v.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ width: 9, height: 9, background: vendorColors.get(v.id) ?? FALLBACK_COLOR, flex: "none" }} />
                      <Input
                        defaultValue={v.displayName}
                        onBlur={(e) => {
                          if (e.target.value.trim() && e.target.value !== v.displayName)
                            updateVendor.mutate({ id: v.id, displayName: e.target.value.trim() });
                        }}
                        style={{ flex: 1, fontWeight: 600 }}
                      />
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* accounts */}
            {aptAccounts.length > 0 && (
              <>
                <p style={subhead}>Accounts</p>
                {aptAccounts.map((a) => (
                  <div key={a.id} style={row}>
                    <span style={{ width: 130, fontFamily: "var(--font-mono)", fontWeight: 600, fontSize: 13 }}>
                      {vendorName(a.vendorId)}
                    </span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--muted)" }}>
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
                        className="fx-x"
                        style={{ marginLeft: "auto", background: "none", border: "none", color: "var(--muted)", cursor: "pointer" }}
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
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 8 }}>
        <Input
          value={newNickname}
          onChange={(e) => setNewNickname(e.target.value)}
          placeholder="New apartment nickname"
          disabled={atLimit}
          style={{ width: 220 }}
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
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted)", alignSelf: "center" }}>
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
      style={{ display: "flex", gap: 8, marginTop: 10 }}
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
        style={{ flex: 1, maxWidth: 280 }}
      />
      <Button type="submit" variant="outline">
        Invite
      </Button>
    </form>
  );
}

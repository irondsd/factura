"use client";

import { useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { type CSSProperties, useState } from "react";
import { useApp } from "@/components/app/context";
import { Display, Eyebrow } from "@/components/charts/primitives";
import { Button, Checkbox, Input, Select } from "@/components/ui";
import { vendorColor } from "@/lib/vendorColors";
import { trpc } from "@/lib/trpc";

export default function ProfilePage() {
  const router = useRouter();
  const { data: session } = useSession();
  const { showToast } = useApp();
  const utils = trpc.useUtils();

  const properties = trpc.properties.list.useQuery();
  const vendors = trpc.vendors.list.useQuery();
  const accounts = trpc.accounts.list.useQuery();

  const invalidate = () => utils.invalidate();
  const createProperty = trpc.properties.create.useMutation({ onSuccess: invalidate });
  const updateProperty = trpc.properties.update.useMutation({ onSuccess: invalidate });
  const deleteProperty = trpc.properties.delete.useMutation({ onSuccess: invalidate });
  const updateVendor = trpc.vendors.update.useMutation({ onSuccess: invalidate });
  const updateAccount = trpc.accounts.update.useMutation({ onSuccess: invalidate });
  const deleteAccount = trpc.accounts.delete.useMutation({ onSuccess: invalidate });

  const [newProp, setNewProp] = useState({ nickname: "", variants: "" });

  const user = session?.user;
  const name = user?.name ?? user?.email ?? "You";
  const initials = name
    .split(/[\s@.]+/)
    .filter(Boolean)
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const parseVariants = (s: string) =>
    s.split(",").map((x) => x.trim()).filter((x) => x.length >= 4);

  const sectionTitle: CSSProperties = { marginTop: 40, marginBottom: 4 };
  const help: CSSProperties = {
    fontFamily: "var(--font-mono)",
    fontSize: 12,
    color: "var(--muted)",
    margin: "0 0 12px",
    maxWidth: 520,
    lineHeight: 1.6,
  };
  const row: CSSProperties = {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 12,
    border: "1px solid var(--line)",
    background: "var(--card)",
    padding: 12,
  };

  const vendorName = (id: string) => vendors.data?.find((v) => v.id === id)?.displayName ?? "—";

  return (
    <div style={{ maxWidth: "52rem", margin: "0 auto", padding: "32px 20px 80px" }}>
      <Eyebrow>Profile</Eyebrow>
      <Display size={34} style={{ display: "block", marginTop: 6 }}>
        Your setup
      </Display>

      {/* account identity */}
      <div style={{ ...row, marginTop: 22, padding: 16, gap: 16 }}>
        <span
          style={{
            width: 44,
            height: 44,
            borderRadius: "50%",
            background: "var(--ink)",
            color: "var(--paper)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "var(--font-mono)",
            fontSize: 14,
            fontWeight: 500,
            flex: "none",
          }}
        >
          {initials}
        </span>
        <div style={{ flex: 1, minWidth: 160 }}>
          <p style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 18, margin: 0, letterSpacing: "-0.01em" }}>
            {name}
          </p>
          <p style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--muted)", margin: "2px 0 0" }}>
            {user?.email}
            {user?.email ? " · " : ""}via Google
          </p>
        </div>
        <Button variant="outline" onClick={() => signOut()}>
          Sign out
        </Button>
      </div>

      {/* properties */}
      <h2 style={sectionTitle}>
        <Eyebrow>Properties</Eyebrow>
      </h2>
      <p style={help}>
        Address variants help match bills that name the building differently
        (corner entrance vs. legal address). Use street + number.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {(properties.data ?? []).map((p) => (
          <div key={p.id} style={row}>
            <Input
              defaultValue={p.nickname}
              onBlur={(e) => {
                if (e.target.value.trim() && e.target.value !== p.nickname)
                  updateProperty.mutate({ id: p.id, nickname: e.target.value.trim() });
              }}
              style={{ width: 150, fontWeight: 600 }}
            />
            <Input
              defaultValue={p.addressVariants.join(", ")}
              placeholder="Address variants, comma-separated"
              onBlur={(e) =>
                updateProperty.mutate({ id: p.id, addressVariants: parseVariants(e.target.value) })
              }
              style={{ flex: 1, minWidth: 240 }}
            />
            <button
              aria-label="Delete"
              onClick={() => {
                deleteProperty.mutate(
                  { id: p.id },
                  {
                    onSuccess: () => showToast("Property removed"),
                    onError: (err) => showToast(`✕ ${err.message}`),
                  },
                );
              }}
              className="fx-x"
              style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer" }}
            >
              ✕
            </button>
          </div>
        ))}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
          <Input
            value={newProp.nickname}
            onChange={(e) => setNewProp({ ...newProp, nickname: e.target.value })}
            placeholder="Nickname"
            style={{ width: 150 }}
          />
          <Input
            value={newProp.variants}
            onChange={(e) => setNewProp({ ...newProp, variants: e.target.value })}
            placeholder="Address variants, comma-separated"
            style={{ flex: 1, minWidth: 240 }}
          />
          <Button
            variant="outline"
            onClick={() => {
              if (!newProp.nickname.trim()) return;
              createProperty.mutate(
                {
                  nickname: newProp.nickname.trim(),
                  addressVariants: parseVariants(newProp.variants),
                },
                { onSuccess: () => showToast("Property added") },
              );
              setNewProp({ nickname: "", variants: "" });
            }}
          >
            Add property
          </Button>
        </div>
      </div>

      {/* vendors */}
      <h2 style={sectionTitle}>
        <Eyebrow>Vendors</Eyebrow>
      </h2>
      <p style={help}>Rename how each vendor shows up everywhere (e.g. Edesur → Luz).</p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {(vendors.data ?? []).map((v) => (
          <div key={v.id} style={row}>
            <span style={{ width: 9, height: 9, background: vendorColor(v), display: "inline-block", flex: "none" }} />
            <Input
              defaultValue={v.displayName}
              onBlur={(e) => {
                if (e.target.value.trim() && e.target.value !== v.displayName)
                  updateVendor.mutate({ id: v.id, displayName: e.target.value.trim() });
              }}
              style={{ width: 150, fontWeight: 600 }}
            />
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--muted)" }}>
              {v.slug} · {v.category}
            </span>
          </div>
        ))}
      </div>

      {/* accounts */}
      <h2 style={sectionTitle}>
        <Eyebrow>Accounts</Eyebrow>
      </h2>
      <p style={help}>
        Active accounts define which bills are expected each month. Usually
        created automatically the first time a new bill arrives.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {(accounts.data ?? []).map((a) => (
          <div key={a.id} style={{ ...row, fontSize: 14 }}>
            <span style={{ width: 132, fontFamily: "var(--font-mono)", fontWeight: 600 }}>
              {vendorName(a.vendorId)}
            </span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--muted)" }}>
              №{a.accountNumber}
            </span>
            <Select
              value={a.propertyId}
              onChange={(e) => updateAccount.mutate({ id: a.id, propertyId: e.target.value })}
              style={{ padding: "4px 12px" }}
            >
              {(properties.data ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nickname}
                </option>
              ))}
            </Select>
            <Checkbox
              label="expected monthly"
              checked={a.active}
              onChange={(e) => updateAccount.mutate({ id: a.id, active: e.target.checked })}
            />
            <button
              aria-label="Delete"
              onClick={() =>
                deleteAccount.mutate(
                  { id: a.id },
                  { onError: (err) => showToast(`✕ ${err.message}`) },
                )
              }
              className="fx-x"
              style={{ marginLeft: "auto", background: "none", border: "none", color: "var(--muted)", cursor: "pointer" }}
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      {/* parsers — link out to the dedicated library (power-user surface) */}
      <h2 style={sectionTitle}>
        <Eyebrow>Parsers</Eyebrow>
      </h2>
      <p style={help}>
        Parsers turn bill PDFs into structured data. Manage your own, publish
        them, or adopt others&apos; — most people never need to touch this.
      </p>
      <Button variant="outline" onClick={() => router.push("/parsers")}>
        Manage parsers →
      </Button>
    </div>
  );
}

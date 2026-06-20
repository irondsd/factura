"use client";

import { useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { type CSSProperties } from "react";
import { Display, Eyebrow } from "@/components/charts/primitives";
import { Button } from "@/components/ui";

export default function ProfilePage() {
  const router = useRouter();
  const { data: session } = useSession();

  const user = session?.user;
  const name = user?.name ?? user?.email ?? "You";
  const initials = name
    .split(/[\s@.]+/)
    .filter(Boolean)
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

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

      {/* apartments — manage on the dedicated page */}
      <h2 style={sectionTitle}>
        <Eyebrow>Apartments</Eyebrow>
      </h2>
      <p style={help}>
        Your apartments hold their bills, vendors and accounts. Invite a partner
        or flatmate so they can see and add bills too.
      </p>
      <Button variant="outline" onClick={() => router.push("/apartments")}>
        Manage apartments →
      </Button>

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

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Session } from "next-auth";
import { Segmented } from "@/components/charts/primitives";
import { trpc } from "@/lib/trpc";
import { useApp } from "./context";

const NAV = [
  { href: "/", label: "Overview" },
  { href: "/insights", label: "Insights" },
  { href: "/bills", label: "Bills" },
  { href: "/profile", label: "Profile" },
];

export function TopBar({ user }: { user: Session["user"] }) {
  const pathname = usePathname();
  const { propertyId, currency, setPropertyId, setCurrency } = useApp();
  const properties = trpc.properties.list.useQuery();

  const onProfile = pathname === "/profile";
  const propValue = propertyId ?? "all";
  const propOptions = [
    { value: "all", label: "All" },
    ...(properties.data ?? []).map((p) => ({ value: p.id, label: p.nickname })),
  ];

  const name = user?.name ?? user?.email ?? "You";
  const initials = name
    .split(/[\s@.]+/)
    .filter(Boolean)
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <header
      style={{
        borderBottom: "1px solid var(--line)",
        background: "color-mix(in srgb, var(--card) 72%, transparent)",
        backdropFilter: "blur(6px)",
        position: "sticky",
        top: 0,
        zIndex: 50,
      }}
    >
      <div
        style={{
          maxWidth: "64rem",
          margin: "0 auto",
          padding: "12px 20px",
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 20,
        }}
      >
        <Link
          href="/"
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 600,
            fontSize: 20,
            letterSpacing: "-0.01em",
            color: "var(--ink)",
            textDecoration: "none",
          }}
        >
          Factura<span style={{ color: "var(--accent)" }}>.</span>
        </Link>
        <nav style={{ display: "flex", gap: 16 }}>
          {NAV.map((l) => {
            const active = pathname === l.href;
            return (
              <Link
                key={l.href}
                href={l.href}
                className="fx-navlink"
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  textTransform: "uppercase",
                  letterSpacing: "0.18em",
                  color: active ? "var(--accent)" : "var(--muted)",
                  textDecorationLine: active ? "underline" : "none",
                  textDecorationStyle: "dotted",
                  textUnderlineOffset: 4,
                }}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
          {!onProfile && (
            <Segmented
              options={propOptions}
              value={propValue}
              onChange={(v) => setPropertyId(v === "all" ? undefined : v)}
            />
          )}
          {!onProfile && (
            <Segmented
              options={[
                { value: "ARS", label: "ARS" },
                { value: "USD", label: "USD" },
              ]}
              value={currency}
              onChange={(v) => setCurrency(v)}
            />
          )}
          <Link
            href="/profile"
            aria-label="Profile"
            title={name}
            className="fx-avatar"
            style={{
              width: 30,
              height: 30,
              borderRadius: "50%",
              flex: "none",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              background: onProfile ? "var(--accent)" : "var(--ink)",
              color: "var(--paper)",
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              fontWeight: 500,
              textDecoration: "none",
              transition: "var(--transition-colors)",
            }}
          >
            {initials}
          </Link>
        </div>
      </div>
    </header>
  );
}

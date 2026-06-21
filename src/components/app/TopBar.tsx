"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Session } from "next-auth";
import { useState } from "react";
import { Segmented } from "@/components/charts/primitives";
import { trpc } from "@/lib/trpc";
import { useApp } from "./context";

const NAV = [
  { href: "/", label: "Overview" },
  { href: "/insights", label: "Insights" },
  { href: "/bills", label: "Bills" },
];

export function TopBar({ user }: { user: Session["user"] }) {
  const pathname = usePathname();
  const { propertyId, setPropertyId } = useApp();
  const properties = trpc.properties.list.useQuery();
  const [menuOpen, setMenuOpen] = useState(false);

  // Close the mobile menu on navigation (render-time sync, keyed by pathname —
  // the project's idiom over a state-setting effect).
  const [prevPath, setPrevPath] = useState(pathname);
  if (pathname !== prevPath) {
    setPrevPath(pathname);
    setMenuOpen(false);
  }

  // The apartment switcher is meaningless on the management pages.
  const onProfile = pathname === "/profile" || pathname === "/apartments";
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

  const navLink = (l: { href: string; label: string }) => {
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
  };

  const avatarCircle = (
    <span
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
        transition: "var(--transition-colors)",
      }}
    >
      {initials}
    </span>
  );

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

        {/* Desktop: inline nav + property picker + avatar */}
        <nav className="fx-desktop-only" style={{ gap: 16 }}>
          {NAV.map(navLink)}
        </nav>
        <div
          className="fx-desktop-only"
          style={{ marginLeft: "auto", alignItems: "center", gap: 10 }}
        >
          {!onProfile && (
            <Segmented
              options={propOptions}
              value={propValue}
              onChange={(v) => setPropertyId(v === "all" ? undefined : v)}
            />
          )}
          <Link href="/profile" aria-label="Profile" title={name}>
            {avatarCircle}
          </Link>
        </div>

        {/* Mobile: burger only */}
        <button
          type="button"
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
          className="fx-mobile-only fx-burger"
          onClick={() => setMenuOpen((o) => !o)}
          style={{
            marginLeft: "auto",
            width: 38,
            height: 34,
            alignItems: "center",
            justifyContent: "center",
            background: "transparent",
            border: "1px solid var(--line)",
            color: "var(--ink)",
            cursor: "pointer",
            transition: "var(--transition-colors)",
          }}
        >
          {menuOpen ? (
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
              <path d="M3 3 L13 13 M13 3 L3 13" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          ) : (
            <svg width="18" height="16" viewBox="0 0 18 16" aria-hidden="true">
              <path
                d="M1 3 H17 M1 8 H17 M1 13 H17"
                stroke="currentColor"
                strokeWidth="1.5"
              />
            </svg>
          )}
        </button>
      </div>

      {/* Mobile menu: nav links, property picker, profile */}
      {menuOpen && (
        <div
          className="fx-mobile-only"
          style={{
            flexDirection: "column",
            gap: 4,
            padding: "8px 20px 18px",
            borderTop: "1px solid var(--line)",
            background: "var(--card)",
          }}
        >
          <nav style={{ display: "flex", flexDirection: "column" }}>
            {NAV.map((l) => {
              const active = pathname === l.href;
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  onClick={() => setMenuOpen(false)}
                  className="fx-navlink"
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 13,
                    textTransform: "uppercase",
                    letterSpacing: "0.18em",
                    padding: "12px 0",
                    color: active ? "var(--accent)" : "var(--muted)",
                    textDecoration: "none",
                    borderBottom: "1px dashed var(--line)",
                  }}
                >
                  {l.label}
                </Link>
              );
            })}
          </nav>

          {!onProfile && (
            <div style={{ marginTop: 14 }}>
              <p
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 10,
                  textTransform: "uppercase",
                  letterSpacing: "0.2em",
                  color: "var(--muted)",
                  margin: "0 0 8px",
                }}
              >
                Apartment
              </p>
              <div className="fx-scroll-x" style={{ paddingBottom: 2 }}>
                <Segmented
                  options={propOptions}
                  value={propValue}
                  onChange={(v) => setPropertyId(v === "all" ? undefined : v)}
                />
              </div>
            </div>
          )}

          <Link
            href="/profile"
            onClick={() => setMenuOpen(false)}
            style={{
              marginTop: 16,
              display: "inline-flex",
              alignItems: "center",
              gap: 10,
              textDecoration: "none",
            }}
          >
            {avatarCircle}
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--ink)" }}>
              {name}
            </span>
          </Link>
        </div>
      )}
    </header>
  );
}

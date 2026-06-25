"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Session } from "next-auth";
import { useState } from "react";
import { Segmented } from "@/components/charts/primitives";
import { Avatar } from "@/components/ui";
import { cn } from "@/lib/cn";
import { trpc } from "@/lib/trpc";
import { BurgerButton } from "./BurgerButton";
import { useApp } from "./context";

const NAV = [
  { href: "/app", label: "Overview" },
  { href: "/app/insights", label: "Insights" },
  { href: "/app/bills", label: "Bills" },
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

  // The property switcher is meaningless on the management pages, and there's
  // nothing to switch between when the user has a single property.
  const onProfile =
    pathname === "/app/profile" || pathname === "/app/properties";
  const showSwitcher = !onProfile && (properties.data?.length ?? 0) > 1;
  const propValue = propertyId ?? "all";
  const propOptions = [
    { value: "all", label: "All" },
    ...(properties.data ?? []).map((p) => ({ value: p.id, label: p.nickname })),
  ];

  const name = user?.name ?? user?.email ?? "You";

  const navLink = (l: { href: string; label: string }) => {
    const active = pathname === l.href;
    return (
      <Link
        key={l.href}
        href={l.href}
        className={cn(
          "font-mono text-micro uppercase tracking-label underline-offset-4 decoration-dotted transition-colors hover:text-ink",
          active ? "text-accent underline" : "text-muted no-underline",
        )}
      >
        {l.label}
      </Link>
    );
  };

  const avatarCircle = (
    <Avatar
      name={name}
      active={onProfile}
      className="text-micro transition-colors hover:bg-accent"
    />
  );

  return (
    <header className="sticky top-0 z-50 border-b border-line bg-[color-mix(in_srgb,var(--card)_72%,transparent)] backdrop-blur-[6px]">
      <div className="mx-auto flex max-w-[64rem] items-center gap-5 py-3 px-5">
        <Link
          href="/app"
          className="font-display font-semibold text-xl tracking-tight text-ink no-underline"
        >
          Factura<span className="text-accent">.</span>
        </Link>

        {/* Desktop: inline nav + property picker + avatar */}
        <nav className="hidden gap-4 md:flex">{NAV.map(navLink)}</nav>
        <div className="ml-auto hidden items-center gap-2.5 md:flex">
          {showSwitcher && (
            <Segmented
              options={propOptions}
              value={propValue}
              onChange={(v) => setPropertyId(v === "all" ? undefined : v)}
            />
          )}
          <Link href="/app/profile" aria-label="Profile" title={name}>
            {avatarCircle}
          </Link>
        </div>

        {/* Mobile: burger only */}
        <BurgerButton open={menuOpen} onToggle={() => setMenuOpen((o) => !o)} />
      </div>

      {/* Mobile menu: nav links, property picker, profile */}
      {menuOpen && (
        <div className="flex flex-col gap-1 border-t border-line bg-card pt-2 px-5 pb-[18px] md:hidden">
          <nav className="flex flex-col">
            {NAV.map((l) => {
              const active = pathname === l.href;
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  onClick={() => setMenuOpen(false)}
                  className={cn(
                    "font-mono text-[13px] uppercase tracking-label py-3 no-underline border-b border-dashed border-line transition-colors hover:text-ink",
                    active ? "text-accent" : "text-muted",
                  )}
                >
                  {l.label}
                </Link>
              );
            })}
          </nav>

          {showSwitcher && (
            <div className="mt-[14px]">
              <p className="font-mono text-[10px] uppercase tracking-label-wide text-muted mb-2">
                Property
              </p>
              <div className="overflow-x-auto [-webkit-overflow-scrolling:touch] pb-0.5">
                <Segmented
                  options={propOptions}
                  value={propValue}
                  onChange={(v) => setPropertyId(v === "all" ? undefined : v)}
                />
              </div>
            </div>
          )}

          <Link
            href="/app/profile"
            onClick={() => setMenuOpen(false)}
            className="mt-4 inline-flex items-center gap-2.5 no-underline"
          >
            {avatarCircle}
            <span className="font-mono text-[13px] text-ink">{name}</span>
          </Link>
        </div>
      )}
    </header>
  );
}

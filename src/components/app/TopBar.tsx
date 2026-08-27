"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Session } from "next-auth";
import { useEffect, useRef, useState } from "react";
import { Avatar, Badge } from "@/components/ui";
import { interpolate } from "@/i18n/config";
import { useT } from "@/i18n/I18nProvider";
import { cn } from "@/lib/cn";
import { trpc } from "@/lib/trpc";
import { BurgerButton } from "./BurgerButton";
import { useApp } from "./context";
import { PropertySelector } from "./PropertySelector";

export function TopBar({ user }: { user: Session["user"] }) {
  const pathname = usePathname();
  const { propertyId, setPropertyId } = useApp();
  const tApp = useT("app");
  const tNav = useT("nav");
  const tProfile = useT("profile");
  const properties = trpc.properties.list.useQuery();
  const [menuOpen, setMenuOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);

  // Bills waiting on the user. An unfiled one is invisible from any single
  // property (it belongs to none), so without this the only way to find it is
  // to already suspect it exists and switch to "Todas".
  const reviewCount = trpc.bills.reviewCount.useQuery().data ?? 0;

  const NAV = [
    { href: "/app", label: tNav.overview },
    { href: "/app/insights", label: tNav.insights },
    { href: "/app/bills", label: tNav.bills, badge: reviewCount },
  ];

  // Close the mobile menu on navigation (render-time sync, keyed by pathname —
  // the project's idiom over a state-setting effect).
  const [prevPath, setPrevPath] = useState(pathname);
  if (pathname !== prevPath) {
    setPrevPath(pathname);
    setMenuOpen(false);
  }

  // Anything outside the bar dismisses the menu — the burger is inside it, so
  // tapping it still toggles rather than closing twice. `pointerdown` fires on
  // the touch itself, which `mousedown` can't be relied on to do.
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: PointerEvent) => {
      if (!headerRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  // The property switcher is meaningless on the management pages, and there's
  // nothing to switch between when the user has a single property.
  const onProfile =
    pathname === "/app/profile" ||
    pathname === "/app/properties" ||
    pathname === "/app/sessions";
  const showSwitcher = !onProfile && (properties.data?.length ?? 0) > 1;

  // The selection lives in the URL (?property=<nickname>), so in-app links must
  // carry it forward — otherwise navigating between pages would reset to "All".
  const propNickname = propertyId
    ? properties.data?.find((p) => p.id === propertyId)?.nickname
    : undefined;
  const withProperty = (href: string) =>
    propNickname
      ? `${href}?${new URLSearchParams({ property: propNickname.toLowerCase() })}`
      : href;

  const name = user?.name ?? user?.email ?? tProfile.you;

  /** The review count, as a badge — and as the label a screen reader gets,
   * since a bare number next to "Facturas" says nothing on its own. */
  const reviewBadge = (n: number) => (
    <Badge
      className="ml-1.5 align-middle"
      aria-label={interpolate(
        n === 1 ? tApp.reviewBadgeOne : tApp.reviewBadgeOther,
        { n },
      )}
    >
      {n}
    </Badge>
  );

  const navLink = (l: { href: string; label: string; badge?: number }) => {
    const active = pathname === l.href;
    return (
      <Link
        key={l.href}
        href={withProperty(l.href)}
        className={cn(
          "font-mono text-micro uppercase tracking-label underline-offset-4 decoration-dotted transition-colors hover:text-ink",
          active ? "text-accent underline" : "text-muted no-underline",
        )}
      >
        {l.label}
        {l.badge ? reviewBadge(l.badge) : null}
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
    <header
      ref={headerRef}
      className="sticky top-0 z-50 border-b border-line bg-[color-mix(in_srgb,var(--card)_72%,transparent)] backdrop-blur-[6px]"
    >
      <div className="mx-auto flex max-w-[64rem] items-center gap-5 py-3 px-5">
        <Link
          href={withProperty("/app")}
          className="font-display font-semibold text-xl tracking-tight text-ink no-underline"
        >
          Factura<span className="text-accent">.</span>
        </Link>

        {/* Desktop: inline nav. */}
        <nav className="hidden gap-4 md:flex">{NAV.map(navLink)}</nav>

        {/* The property switcher rides at both sizes — on a phone it sits
            beside the burger rather than inside the menu, so switching
            properties costs one tap instead of three. */}
        <div className="ml-auto flex items-center gap-2.5">
          {showSwitcher && (
            <PropertySelector
              properties={properties.data ?? []}
              value={propertyId}
              onChange={setPropertyId}
            />
          )}
          <Link
            href={withProperty("/app/profile")}
            aria-label={tApp.navProfile}
            title={name}
            className="hidden md:inline-flex"
          >
            {avatarCircle}
          </Link>
          <BurgerButton
            open={menuOpen}
            onToggle={() => setMenuOpen((o) => !o)}
            openLabel={tApp.menuOpen}
            closeLabel={tApp.menuClose}
          />
        </div>
      </div>

      {/* Mobile menu: nav links + profile. */}
      {menuOpen && (
        <div className="flex flex-col gap-1 border-t border-line bg-card pt-2 px-5 pb-[18px] md:hidden">
          <nav className="flex flex-col">
            {NAV.map((l) => {
              const active = pathname === l.href;
              return (
                <Link
                  key={l.href}
                  href={withProperty(l.href)}
                  onClick={() => setMenuOpen(false)}
                  className={cn(
                    "font-mono text-[13px] uppercase tracking-label py-3 no-underline border-b border-dashed border-line transition-colors hover:text-ink",
                    active ? "text-accent" : "text-muted",
                  )}
                >
                  {l.label}
                  {l.badge ? reviewBadge(l.badge) : null}
                </Link>
              );
            })}
          </nav>

          <Link
            href={withProperty("/app/profile")}
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

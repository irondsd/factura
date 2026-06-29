"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";

// Mobile-only nav: a burger button that drops down the sub-page links. "Sign in"
// stays in the header bar (rendered by SiteHeader), so it is NOT passed here —
// everything else lives behind the burger. Hidden from `sm:` up, where the full
// nav row takes over. `href`s arrive already localized from the server.
type NavItem = { label: string; href: string; active?: boolean };

export function MobileMenu({ links }: { links: NavItem[] }) {
  const [open, setOpen] = useState(false);

  // Close on Escape for keyboard users.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="sm:hidden">
      <button
        type="button"
        aria-label={open ? "Cerrar menú" : "Abrir menú"}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex h-9 w-9 -mr-2 flex-col items-center justify-center gap-[5px] cursor-pointer border-none bg-transparent"
      >
        <span
          className={cn(
            "block h-px w-5 bg-ink transition-transform",
            open && "translate-y-[6px] rotate-45",
          )}
        />
        <span
          className={cn(
            "block h-px w-5 bg-ink transition-opacity",
            open && "opacity-0",
          )}
        />
        <span
          className={cn(
            "block h-px w-5 bg-ink transition-transform",
            open && "-translate-y-[6px] -rotate-45",
          )}
        />
      </button>

      {open && (
        <>
          {/* Click-away layer below the 60px header bar. */}
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-x-0 bottom-0 top-[60px] z-30 cursor-default border-none bg-transparent"
          />
          <nav className="absolute inset-x-0 top-[60px] z-40 border-b border-line bg-card shadow-pop">
            <ul className="m-0 list-none p-0">
              {links.map((link) => (
                <li
                  key={link.href}
                  className="border-t border-line first:border-t-0"
                >
                  <Link
                    href={link.href}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "block px-5 py-4 font-mono text-[14px] uppercase tracking-[0.14em] no-underline transition-colors hover:bg-[var(--accent-soft)] hover:text-accent",
                      link.active ? "text-accent" : "text-ink",
                    )}
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </>
      )}
    </div>
  );
}

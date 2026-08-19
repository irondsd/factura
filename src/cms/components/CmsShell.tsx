import Link from "next/link";
import type { ReactNode } from "react";
import type { CmsActor } from "../types";
import { canManageTokens } from "../auth/policy";
import { CMS_SECTIONS, cmsSectionPath } from "../sections";

// The CMS chrome. Deliberately its own thing rather than a reuse of `AppShell`:
// the bill app's shell carries the property switcher, the tRPC providers and the
// PWA furniture, none of which a publishing console needs, and importing it
// would tie `src/cms` to the half of the codebase that is meant to move to a
// different deployment (cms.md §2.2).
//
// Nothing here is client-side. The CMS is a small number of dynamic server
// pages; interactivity arrives with the editor in Phase 5 and stays scoped to
// the components that need it.

type NavLink = { href: string; label: string; adminOnly?: boolean };

// Built from the section registry, so a new section appears in the navigation
// by being registered rather than by being remembered. `/cms/tokens` stays
// top-level: it is not scoped to a section.
const NAV: readonly NavLink[] = [
  // { href: "/cms", label: "Secciones" },
  ...CMS_SECTIONS.filter((section) => section.status === "live").map(
    (section) => ({
      href: cmsSectionPath(section.id),
      label: section.label,
    }),
  ),
  { href: "/cms/tokens", label: "Tokens", adminOnly: true },
];

export function CmsShell({
  actor,
  children,
}: {
  actor: CmsActor;
  children: ReactNode;
}) {
  const links = NAV.filter((l) => !l.adminOnly || canManageTokens(actor));

  return (
    <div className="min-h-full flex flex-col bg-paper text-ink">
      {/* The banner says what this is on every screen. There is one CMS and it
          edits the live public site; a tab that looks like the app is exactly
          the confusion worth spending a header on. */}
      <header className="border-b border-line">
        <div className="mx-auto w-full max-w-[1100px] px-5 py-4 flex flex-wrap items-center gap-x-6 gap-y-2">
          <Link
            href="/cms"
            className="font-display font-semibold text-[19px] tracking-[-0.02em] no-underline text-ink"
          >
            Factura<span className="text-accent">.</span>CMS
          </Link>
          <nav className="flex items-center gap-4">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="font-mono text-micro uppercase tracking-label-wide text-muted no-underline transition-colors hover:text-accent"
              >
                {l.label}
              </Link>
            ))}
          </nav>
          <span className="ml-auto font-mono text-micro uppercase tracking-label-wide text-muted">
            {actor.email ?? actor.userId} · {actor.role}
          </span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1100px] flex-1 px-5 py-10">
        {children}
      </main>

      {/* Navigation is not the access control — `requireCmsMember` is (and its
          tests are what prove it). This line is here so nobody reads the
          filtered nav above as the security boundary. */}
      <footer className="border-t border-line">
        <div className="mx-auto w-full max-w-[1100px] px-5 py-4 font-mono text-micro text-muted">
          Herramienta interna. Los cambios publicados tardan hasta una hora en
          verse en el sitio público.
        </div>
      </footer>
    </div>
  );
}

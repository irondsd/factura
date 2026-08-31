import Link from "next/link";
import type { ReactNode } from "react";
import type { CmsActor } from "../types";
import { CMS_SECTIONS, cmsSectionPath } from "../sections";
import { CmsSearch } from "./CmsSearch";
import { CmsIcon } from "../icons";

// The CMS chrome. Deliberately its own thing rather than a reuse of `AppShell`:
// the bill app's shell carries the property switcher, the tRPC providers and the
// PWA furniture, none of which a publishing console needs, and importing it
// would tie `src/cms` to the half of the codebase that is meant to move to a
// different deployment (cms.md).
//
// Server-rendered but for one thing: the search is a client component, because
// it is a modal surface that talks to the server on Enter. The shell itself
// stays a server component around it.

type NavLink = { href: string; label: string };

// Built from the section registry, so a new section appears in the navigation
// by being registered rather than by being remembered.
//
// What is *not* here is «Tokens». It was the one nav entry most editors could
// not use and the rest opened about twice a year, and it sat in the same row as
// the four sections — as much weight as Guías. It moved to `/cms`, next to
// «Autores», which is where the console keeps the things you administer rather
// than the things you edit. The search took its place: reachable from every
// screen is exactly what a search wants and what a token page never did.
const NAV: readonly NavLink[] = [
  // { href: "/cms", label: "Secciones" },
  ...CMS_SECTIONS.filter((section) => section.status === "live").map(
    (section) => ({
      href: cmsSectionPath(section.id),
      label: section.label,
    }),
  ),
  // After the authored sections: media is a thing every editor touches.
  { href: "/cms/media", label: "Medios" },
];

export function CmsShell({
  actor,
  children,
}: {
  actor: CmsActor;
  children: ReactNode;
}) {
  return (
    <div className="min-h-full flex flex-col bg-paper text-ink">
      {/* The banner says what this is on every screen. There is one CMS and it
          edits the live public site; a tab that looks like the app is exactly
          the confusion worth spending a header on. */}
      <header className="border-b border-line">
        <div className="relative mx-auto flex w-full max-w-[1100px] items-center gap-2 px-4 py-3 sm:px-5 lg:gap-6 lg:py-4">
          <Link
            href="/cms"
            className="shrink-0 font-display font-semibold text-[19px] tracking-[-0.02em] no-underline text-ink"
          >
            Factura<span className="text-accent">.</span>CMS
          </Link>
          <nav className="hidden items-center gap-4 lg:flex" aria-label="CMS">
            {NAV.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="font-mono text-micro uppercase tracking-label-wide text-muted no-underline transition-colors hover:text-accent"
              >
                {l.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto lg:ml-0">
            <CmsSearch />
          </div>
          <div className="ml-auto hidden flex-col gap-0 lg:flex">
            <span className="ml-auto text-micro uppercase tracking-label-wide text-muted">
              {actor.name || actor.email || actor.userId}
            </span>
            <span className="ml-auto text-micro uppercase tracking-label-wide text-accent">
              {actor.role}
            </span>
          </div>

          <details className="group lg:hidden">
            <summary
              aria-label="Menú del CMS"
              className="flex size-11 cursor-pointer list-none items-center justify-center border border-line text-muted transition-colors hover:border-accent hover:text-accent focus-visible:border-accent focus-visible:text-accent focus-visible:outline-none [&::-webkit-details-marker]:hidden"
            >
              <CmsIcon name="menu" size="md" className="group-open:hidden" />
              <CmsIcon
                name="close"
                size="md"
                className="hidden group-open:block"
              />
            </summary>
            <div className="absolute inset-x-0 top-full z-40 border-y border-line bg-paper px-4 py-3 shadow-pop sm:px-5">
              <nav className="flex flex-col" aria-label="CMS móvil">
                {NAV.map((l) => (
                  <Link
                    key={l.href}
                    href={l.href}
                    className="flex min-h-11 items-center border-b border-line/70 font-mono text-micro uppercase tracking-label-wide text-ink no-underline transition-colors last:border-b-0 hover:text-accent focus-visible:text-accent focus-visible:outline-none"
                  >
                    {l.label}
                  </Link>
                ))}
              </nav>
              <div className="mt-3 flex items-center justify-between border-t border-line pt-3 font-mono text-micro uppercase tracking-label-wide">
                <span className="min-w-0 truncate text-muted">
                  {actor.name || actor.email || actor.userId}
                </span>
                <span className="ml-4 shrink-0 text-accent">{actor.role}</span>
              </div>
            </div>
          </details>
        </div>
      </header>

      <main className="mx-auto w-full min-w-0 max-w-[1100px] flex-1 px-4 py-7 sm:px-5 md:py-10">
        {children}
      </main>

      {/* Navigation is not the access control — `requireCmsMember` is, and
          `/cms/tokens` still checks `canManageTokens` itself (their tests are
          what prove both). This line is here so nobody reads a link's presence
          or absence as the security boundary. */}
      <footer className="border-t border-line">
        <div className="mx-auto w-full max-w-[1100px] px-4 py-4 font-mono text-micro leading-relaxed text-muted sm:px-5">
          Herramienta interna. Los cambios en páginas publicadas se ven en el
          sitio público en la siguiente visita.
        </div>
      </footer>
    </div>
  );
}

import { cn } from "@/lib/cn";

// Small shared pieces for the landing page, in the product's paper voice.

// Page shell: the centered max-width column the marketing sub-pages (FAQ, Docs,
// Guías, legal) and the SiteHeader/SiteFooter share.
//
// `w-full` is load-bearing, not decoration. The layout's <body> is a column
// flex container, so a <main className={SHELL}> is a flex item whose auto width
// resolves against its *content's* intrinsic size rather than the viewport: one
// `white-space: nowrap` run anywhere below (a truncating breadcrumb, a wide
// table cell) makes the column — and with it the whole document — wider than
// the screen, which is a horizontal scrollbar on a phone. Pinning the width to
// 100% makes it definite, so overflow is contained where it happens and the
// usual `truncate` / `overflow-x-auto` escape hatches inside actually work.
export const SHELL = "w-full max-w-[1040px] mx-auto px-5 sm:px-8";

// Anchor props for every link that leaves the public site for the signed-in
// app — sign-in, above all. A visitor reading the FAQ, halfway through a /probar
// drop, or mid-guide loses their place if /login takes over the tab, and the
// two contexts are separate things to have open: the marketing page stays where
// it was and the app arrives beside it. `noopener` because the new tab is the
// same origin as far as the browser cares, but a tab that can reach back
// through `window.opener` is never what we want.
export const NEW_TAB = { target: "_blank", rel: "noopener" } as const;

// Nav-link styling shared by the header and footer.
export const NAV_LINK =
  "font-mono text-micro uppercase tracking-[0.16em] text-muted no-underline whitespace-nowrap transition-colors hover:text-accent";

export function Wordmark({ size = 34 }: { size?: number }) {
  return (
    <span
      className="font-display font-semibold tracking-tight text-ink leading-none"
      style={{ fontSize: size }}
    >
      Factura<span className="text-accent">.</span>
    </span>
  );
}

// Uppercase, tracked micro-label used for eyebrows and section labels.
export function Eyebrow({
  children,
  tone = "muted",
  className,
}: {
  children: React.ReactNode;
  tone?: "muted" | "accent";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "font-mono text-micro uppercase tracking-label-wide",
        tone === "accent" ? "text-accent" : "text-muted",
        className,
      )}
    >
      {children}
    </span>
  );
}

// Perforated divider: a dashed rule with end "punch" holes, like a tear line.
export function Perforation({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center", className)} aria-hidden="true">
      <div className="w-3.5 h-3.5 -ml-[7px] rounded-full bg-paper border border-line flex-none" />
      <div className="flex-1 border-t border-dashed border-line" />
      <div className="w-3.5 h-3.5 -mr-[7px] rounded-full bg-paper border border-line flex-none" />
    </div>
  );
}

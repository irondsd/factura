import { cn } from "@/lib/cn";

// Small shared pieces for the landing page, in the product's paper voice.

// Page shell: the centered max-width column the marketing sub-pages (FAQ, Docs,
// Guías, legal) and the SiteHeader/SiteFooter share.
export const SHELL = "max-w-[1040px] mx-auto px-5 sm:px-8";

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

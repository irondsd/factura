import { cn } from "@/lib/cn";

// Small shared pieces for the landing page, in the product's paper voice.

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

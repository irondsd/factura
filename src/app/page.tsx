import Link from "next/link";

// Public marketing landing. Intentionally minimal for now — the real page is
// built in a later session. The signed-in app lives under /app.
export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-5 py-10 text-center">
      <span className="font-display font-semibold text-[44px] tracking-tight">
        Factura<span className="text-accent">.</span>
      </span>
      <p className="font-mono text-sm text-muted leading-[1.6] mt-4 max-w-[32rem]">
        Drop a bill, get a ledger. Your utilities — quietly accounted for, and
        yours alone.
      </p>
      <Link
        href="/app"
        className="mt-7 inline-flex items-center justify-center font-mono text-[13px] text-paper bg-ink py-3 px-6 no-underline transition-colors hover:bg-accent"
      >
        Open the app ›
      </Link>
    </div>
  );
}

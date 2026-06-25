import Link from "next/link";
import { LedgerPeek } from "@/components/landing/LedgerPeek";
import { Eyebrow, Perforation, Wordmark } from "@/components/landing/parts";
import { cn } from "@/lib/cn";

// Public marketing landing — "the long receipt": one narrow centered column
// that reads top-to-bottom like a single printed slip. The signed-in app lives
// under /app; every call to action points at /login.

const STEPS = [
  {
    n: "01",
    title: "Drop the PDF",
    body: "Drag any bill onto the page. Factura pulls out the text and keeps the original PDF safe in storage — ready to re-parse later.",
  },
  {
    n: "02",
    title: "We read it",
    body: "Vendor-specific parsers find the amount, the billing period, and the meter reading. A glance to confirm, never a form to fill.",
  },
  {
    n: "03",
    title: "Watch it move",
    body: "Totals roll up per property and month. Missing bills get flagged, and insights show where the money goes over time.",
  },
];

const FEATURES = [
  {
    label: "Per property, per month",
    body: "Totals roll up by apartment and by month, with a USD blue-rate estimate alongside the pesos.",
  },
  {
    label: "Missing-bill radar",
    body: "Factura knows what usually arrives. When MetroGAS is late for June, you'll see △ awaiting — not a gap.",
  },
  {
    label: "Insights that read plainly",
    body: "Stacked spend, vendor share, per-vendor trend, and an inflation lens — pesos vs. the dollar cost, side by side.",
  },
  {
    label: "Stored securely",
    body: "Every PDF is kept safe and can be re-parsed straight from storage when a parser gets smarter. The data stays yours.",
  },
  {
    label: "Built for Argentina",
    body: "Edesur, MetroGAS, Personal and Expensas come ready out of the box. Add your own accounts in a click.",
  },
  {
    label: "Reads like a receipt",
    body: "No dashboards screaming for attention. Just a calm page that totals up like an honest slip of paper.",
  },
];

const NAV = [
  { label: "Docs", href: "/docs" },
  { label: "FAQ", href: "/faq" },
  { label: "Demo", href: "/demo" },
  { label: "Sign in", href: "/login" },
  { label: "GitHub", href: "https://github.com/irondsd/factura" },
];

const HAIRLINE = "border-t border-[color-mix(in_srgb,var(--line)_70%,transparent)]";

export default function LandingPage() {
  return (
    <div className="mx-auto max-w-[560px] px-6">
      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="text-center pt-[92px] pb-[60px]">
        <div className="mb-[22px]">
          <Eyebrow>A bill ledger for the home</Eyebrow>
        </div>
        <div className="mb-7">
          <Wordmark size={46} />
        </div>
        <h1 className="font-display font-semibold text-[46px] tracking-tight leading-[1.08] m-0 mb-[22px] whitespace-pre-line text-ink">
          {"Drop a bill,\nget a ledger."}
        </h1>
        <p className="font-mono text-[14.5px] leading-[1.7] text-muted mx-auto max-w-[460px]">
          Drag a utility-bill PDF onto the page. Factura reads it, files the
          amount and period, and keeps a running ledger of every peso —
          electricity, gas, internet, expensas. Stored securely, and yours
          alone.
        </p>

        <div className="flex flex-col items-center gap-3.5 mt-9">
          <Cta>Get started</Cta>
        </div>
        <div className="mt-[34px]">
          <Eyebrow>Stored securely · re-parsed anytime</Eyebrow>
        </div>
      </section>

      <Perforation className="mb-16" />

      {/* ── How it works ─────────────────────────────────────── */}
      <section className="pb-16">
        <SectionLabel>How it works</SectionLabel>
        <div className="flex flex-col gap-1">
          {STEPS.map((s, i) => (
            <div
              key={s.n}
              className={cn("grid grid-cols-[64px_1fr] gap-5 py-6", i !== 0 && HAIRLINE)}
            >
              <span className="font-display font-semibold text-[34px] text-accent tracking-tight leading-none">
                {s.n}
              </span>
              <div>
                <h3 className="font-display font-semibold text-xl m-0 mb-2 tracking-tight">
                  {s.title}
                </h3>
                <p className="font-mono text-[13.5px] leading-[1.65] text-muted m-0">
                  {s.body}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <Perforation className="mb-16" />

      {/* ── Product peek ─────────────────────────────────────── */}
      <section className="pb-16">
        <SectionLabel>A peek inside</SectionLabel>
        <LedgerPeek compact />
        <p className="text-center font-mono text-xs text-muted mt-[18px]">
          Palermo · June 2026 so far · 3 of 4 bills in, one awaiting.
        </p>
      </section>

      <Perforation className="mb-16" />

      {/* ── Features ─────────────────────────────────────────── */}
      <section className="pb-16">
        <SectionLabel>What it does</SectionLabel>
        <div>
          {FEATURES.map((f, i) => (
            <div
              key={f.label}
              className={cn("py-[18px]", i !== 0 && HAIRLINE)}
            >
              <div className="mb-[7px]">
                <Eyebrow className="text-ink tracking-[0.14em]">
                  {f.label}
                </Eyebrow>
              </div>
              <p className="font-mono text-[13.5px] leading-[1.65] text-muted m-0">
                {f.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Closing CTA ──────────────────────────────────────── */}
      <section className="text-center pb-16">
        <h2 className="font-display font-semibold text-3xl tracking-tight m-0 mb-[22px]">
          Start your ledger.
        </h2>
        <Cta>Get started</Cta>
      </section>

      {/* ── Footer ───────────────────────────────────────────── */}
      <footer className="pb-14 border-t border-line pt-[26px] mt-2">
        <div className="flex flex-wrap items-center justify-between gap-[18px]">
          <Wordmark size={22} />
          <nav className="flex flex-wrap gap-[22px]">
            {NAV.map((l) => (
              <a
                key={l.label}
                href={l.href}
                className="font-mono text-micro uppercase tracking-[0.16em] text-muted no-underline whitespace-nowrap transition-colors hover:text-accent"
              >
                {l.label}
              </a>
            ))}
          </nav>
        </div>
        <div className="mt-[22px] flex flex-wrap gap-2 justify-between">
          <Eyebrow>Bill ledger · Stored securely</Eyebrow>
          <Eyebrow>Argentina · ARS ≈ USD</Eyebrow>
        </div>
      </footer>
    </div>
  );
}

// Solid "get started" call to action. Mirrors the app's <Button variant="solid"
// size="lg"> classes, rendered as a Link since it navigates.
function Cta({ children }: { children: React.ReactNode }) {
  return (
    <Link
      href="/login"
      className="inline-flex items-center justify-center gap-2 whitespace-nowrap min-w-[280px] py-2.5 px-4 font-mono text-xs uppercase tracking-label leading-none border border-ink bg-ink text-paper no-underline transition-colors hover:bg-accent hover:border-accent"
    >
      {children}
    </Link>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-center mb-[30px]">
      <Eyebrow tone="accent">{children}</Eyebrow>
    </div>
  );
}

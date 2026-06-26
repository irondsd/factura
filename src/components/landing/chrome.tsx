import Link from "next/link";
import { Eyebrow, Wordmark } from "@/components/landing/parts";
import { cn } from "@/lib/cn";

// Marketing sub-page chrome (FAQ, Docs): a light paper top bar + footer that is
// deliberately NOT the signed-in app header. Built on the same tokens as the
// landing page; sits on a wider 1040px shell than the receipt column.

export const SHELL = "max-w-[1040px] mx-auto px-5 sm:px-8";

const TOP_NAV = [
  { label: "Docs", href: "/docs" },
  { label: "FAQ", href: "/faq" },
  { label: "Demo", href: "/demo" },
  { label: "Sign in", href: "/login" },
];

const FOOT_NAV = [
  ...TOP_NAV,
  { label: "GitHub", href: "https://github.com/irondsd/factura" },
];

const NAV_LINK =
  "font-mono text-micro uppercase tracking-[0.16em] text-muted no-underline whitespace-nowrap transition-colors hover:text-accent";

export function SiteTop({ active }: { active?: string }) {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-[color-mix(in_srgb,var(--card)_78%,transparent)] backdrop-blur-[8px]">
      <div
        className={cn(
          SHELL,
          "flex h-[60px] items-center justify-between gap-5",
        )}
      >
        <Link href="/" className="no-underline">
          <Wordmark size={21} />
        </Link>
        <nav className="flex items-center gap-4 sm:gap-[26px]">
          {TOP_NAV.map((l) => (
            <Link
              key={l.label}
              href={l.href}
              className={cn(
                NAV_LINK,
                l.label === active &&
                  "text-accent underline decoration-dotted underline-offset-[5px]",
              )}
            >
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}

export function SiteFoot() {
  return (
    <footer className="mt-2 border-t border-line pt-[26px] pb-14">
      <div className={SHELL}>
        <div className="flex flex-wrap items-center justify-between gap-[18px]">
          <Wordmark size={22} />
          <nav className="flex flex-wrap gap-[22px]">
            {FOOT_NAV.map((l) => (
              <a key={l.label} href={l.href} className={NAV_LINK}>
                {l.label}
              </a>
            ))}
          </nav>
        </div>
        <div className="mt-[22px] flex flex-wrap justify-between gap-2">
          <Eyebrow>Stored securely · yours alone</Eyebrow>
          <Eyebrow>Buenos Aires · ARS ≈ USD</Eyebrow>
        </div>
      </div>
    </footer>
  );
}

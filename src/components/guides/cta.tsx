import Link from "next/link";
import { cn } from "@/lib/cn";

// CTA pieces used inside guide MDX (Spanish-only section, so labels are inline
// Spanish — no dictionary lookup). Registered globally in `mdx-components.tsx`
// so guides can drop <DemoCta/> / <SignupCta/> without importing anything.
// Built on the same button language as the FAQ closing CTA.

const BASE =
  "inline-flex items-center justify-center font-mono text-[13px] uppercase tracking-[0.12em] no-underline py-3 px-[26px] transition-colors";

const VARIANTS = {
  solid: "border border-ink bg-ink text-paper hover:bg-transparent hover:text-ink",
  outline: "border border-ink bg-transparent text-ink hover:bg-ink hover:text-paper",
} as const;

export function CtaButton({
  href,
  children,
  variant = "solid",
  className,
}: {
  href: string;
  children: React.ReactNode;
  variant?: keyof typeof VARIANTS;
  className?: string;
}) {
  return (
    <Link href={href} className={cn(BASE, VARIANTS[variant], className)}>
      {children}
    </Link>
  );
}

/** Row wrapper so a guide can place a couple of CTAs side by side. */
export function CtaRow({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap gap-3 my-8">{children}</div>;
}

export function DemoCta({ children }: { children?: React.ReactNode }) {
  return (
    <CtaButton href="/demo" variant="outline">
      {children ?? "Ver la demo"}
    </CtaButton>
  );
}

export function SignupCta({ children }: { children?: React.ReactNode }) {
  return (
    <CtaButton href="/login" variant="solid">
      {children ?? "Crear una cuenta gratis"}
    </CtaButton>
  );
}

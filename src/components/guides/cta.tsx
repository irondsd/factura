import { Button } from "@/components/ui";

// CTA pieces used inside guide MDX (Spanish-only section, so labels are inline
// Spanish — no dictionary lookup). Registered globally in `mdx-components.tsx`
// so guides can drop <DemoCta/> / <SignupCta/> without importing anything.
//
// These are just the app's <Button> at the marketing size — the wrappers exist
// for the MDX shorthand, not for a look of their own.

export function CtaButton({
  href,
  children,
  variant = "solid",
  className,
}: {
  href: string;
  children: React.ReactNode;
  variant?: "solid" | "invert";
  className?: string;
}) {
  return (
    <Button href={href} variant={variant} size="xl" className={className}>
      {children}
    </Button>
  );
}

/** Row wrapper so a guide can place a couple of CTAs side by side. */
export function CtaRow({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap gap-3 my-8">{children}</div>;
}

export function DemoCta({ children }: { children?: React.ReactNode }) {
  return (
    <CtaButton href="/demo" variant="invert">
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

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

/** The CTA that asks for nothing, for the middle of a bill walkthrough.
 *
 * The closing <SignupCta/> asks a stranger to open an account on the strength of
 * prose. This one lands where the reader already has the PDF the guide is about
 * open in front of them, and asks only that they drop it — the product argues
 * for itself in a way a paragraph can't.
 *
 * It deliberately promises a look, not a result: "mira qué datos extrae", never
 * "la leemos". Plenty of vendors have no parser yet, and a bill we can't read is
 * still worth the drop — /probar collects the vendor hint and an address, and
 * those samples are how the next parser gets written.
 *
 * `vendor` names the issuer in the headline; omit it on guides that aren't about
 * one company's bill. `noun` is what that document is actually called — AGIP
 * sends a *boleta* and an administración sends a *liquidación*, and calling
 * either one a "factura" is the kind of small wrongness a reader notices.
 * `children` replaces the body copy when a guide wants to name the fields that
 * matter to it (kWh, m³, unidades funcionales). */
export function ProbarCta({
  vendor,
  noun = "factura",
  children,
}: {
  vendor?: string;
  noun?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="receipt-edge my-10 flex flex-col gap-4 border border-accent/55 bg-card px-5 pt-6 pb-11 sm:flex-row sm:items-center sm:gap-6">
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-accent">
          Sin cuenta
        </span>
        <h3 className="font-display text-xl leading-tight sm:text-2xl">
          {vendor
            ? `¿Tienes tu ${noun} de ${vendor} a mano?`
            : `¿Tienes tu ${noun} a mano?`}
        </h3>
        {/* A div, not a <p>: MDX wraps block children in their own paragraph,
            and a <p> inside a <p> is invalid HTML that React re-nests at
            hydration. The child-paragraph reset keeps either shape looking the
            same — same trick as the blockquote in mdx-components.tsx. */}
        <div className="font-mono text-[14px] leading-[1.7] text-muted [&_p]:my-0">
          {children ??
            "Arrastra el PDF y mira en pantalla qué datos extrae Factura: importe, vencimiento y período. No hace falta crear una cuenta."}
        </div>
      </div>
      <Button href="/probar" variant="solid" size="lg" className="sm:flex-none">
        Probar con mi factura
      </Button>
    </div>
  );
}

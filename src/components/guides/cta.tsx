import { Eyebrow } from "@/components/landing/parts";
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

/** The one-line CTA between the article header and the first paragraph.
 *
 * The closing block only reaches the readers who finish; this one is for the
 * ones who skim the intro and bounce. It stays deliberately thin — one line of
 * copy and a single button — because at this point in the page the visitor came
 * for an answer and hasn't been given it yet, and a card here would read as an
 * ad in front of the article.
 *
 * The copy is `meta.cta`, not a child, so the *page* places it: an author can't
 * accidentally push it below the fold, and a guide can't ship without one (the
 * validator requires the field). It's a hook, not a summary — the question the
 * guide's reader already has, and what an account does about it.
 *
 * The button is `accent` rather than the landing page's `solid` — the two fills
 * swapped, accent at rest and ink on hover. This one sits inside a bordered,
 * card-coloured strip that a skimmer's eye reads as one grey block, and an ink
 * fill in there is another rectangle; the orange is the only thing in the band
 * that isn't. Row on a desktop, stacked on a phone. */
export function TopCta({ children }: { children: React.ReactNode }) {
  return (
    <aside className="mt-7 flex flex-col gap-3 border border-line bg-card px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      {/* `text-pretty` because the copy is one or two lines at the article's
          column width, and the second line is otherwise a two-word orphan. */}
      <p className="font-mono text-[13.5px] leading-[1.55] text-pretty text-ink/90 m-0">
        {children}
      </p>
      {/* `self-start` so the stacked phone layout doesn't hand the button the
          full width of the block — it's a button, not a banner. */}
      <Button
        href="/login"
        variant="accent"
        size="lg"
        className="self-start sm:flex-none sm:self-auto"
      >
        Crear una cuenta
      </Button>
    </aside>
  );
}

/** The block every guide ends with, below <RelatedGuides />.
 *
 * It used to be a bare <CtaRow/> holding the two buttons, which asked a reader
 * who had just finished the article to "crear una cuenta gratis" without ever
 * saying an account *for what*. The guide is the whole relationship we have with
 * that visitor: they came for one answer, got it, and left.
 *
 * So this borrows the shape of <ProbarCta/> — a line of offer, then the button —
 * and applies it to the closing ask. `title` and the body copy are written per
 * guide and stay concrete about the topic the reader just spent five minutes on:
 * "guarda los kWh de cada boleta" is an argument, "organiza tus servicios" is
 * not. Two sentences is the budget; the article already made the long case.
 *
 * The defaults are the generic version, so a guide that omits them still says
 * something — but a guide-specific pair is the point of the component. */
export function ClosingCta({
  title,
  children,
}: {
  title?: string;
  children?: React.ReactNode;
}) {
  return (
    <section className="my-10 border border-line bg-card px-5 py-7 sm:px-7">
      {/* Paired with the "Sin cuenta" eyebrow on <ProbarCta/>: the two blocks
          are the same offer at the two prices a reader can pay. */}
      <Eyebrow tone="accent">Con una cuenta</Eyebrow>
      <h2 className="font-display font-semibold text-[24px] sm:text-[27px] tracking-[-0.02em] leading-[1.15] mt-3 mb-0">
        {title ?? "Tus facturas, ordenadas solas"}
      </h2>
      {/* A div, not a <p> — same reason as <ProbarCta/>: MDX gives block
          children their own paragraph, and a <p> in a <p> is invalid HTML that
          React re-nests at hydration. The reset keeps both shapes identical. */}
      <div className="font-mono text-[15px] leading-[1.75] text-ink/90 mt-3 [&_p]:my-0">
        {children ??
          "Sube el PDF de cualquier factura y Factura extrae el importe, el período y el vencimiento, y arma el histórico de cada servicio mes a mes — en pesos y en dólares."}
      </div>
      <div className="flex flex-wrap gap-3 mt-6">
        <DemoCta />
        <SignupCta />
      </div>
      {/* The demo button is the low-commitment half of the offer and nothing
          else on the page says so. */}
      <p className="font-mono text-micro leading-[1.6] text-muted mt-4 mb-0">
        La demo se abre con datos de muestra; no hace falta registrarse para
        mirarla.
      </p>
    </section>
  );
}

/** The CTA that rides the scroll, in the table-of-contents gutter.
 *
 * A statistics page is long — ten sections, a full-width map, several tables —
 * and between the <TopCta /> above the first figure and the <ClosingCta /> at
 * the bottom there are five or six screens on which nothing is on offer. This
 * fills them without spending a line of the article: from `lg` up the contents
 * column is 220px of otherwise-empty gutter, and a card pinned under the list
 * stays on screen for the whole read.
 *
 * Deliberately quieter than the two block CTAs. It sits *beside* the article
 * rather than in it, permanently, and a loud card in the gutter would compete
 * with the figure the reader came for. One line of offer, one button, and the
 * demo as a text link under it.
 *
 * The copy is fixed rather than per-page: `meta.cta` is already on screen in
 * the <TopCta />, and repeating one sentence twice in the same viewport reads
 * as a template rather than as an argument. What it says instead is the thing
 * this whole section makes credible — these are series, and you can have one of
 * your own.
 *
 * Kept under ~180px on purpose. It shares a capped sticky column with the
 * contents, so every line here is a line of the list that scrolls out of sight
 * on a laptop; two sentences and a button is what the space can afford. */
export function AsideCta() {
  return (
    <aside className="border border-line bg-card px-3.5 py-3.5">
      <Eyebrow tone="accent">Con una cuenta</Eyebrow>
      <p className="font-display font-semibold text-[17px] leading-[1.2] tracking-tight text-ink mt-1.5 mb-0">
        Tu propia serie
      </p>
      <p className="font-mono text-[12.5px] leading-[1.5] text-muted mt-1.5 mb-0">
        Sube tus boletas y se arma sola, mes a mes.
      </p>
      <Button href="/login" variant="solid" size="sm" className="mt-3 w-full">
        Crear una cuenta
      </Button>
      <Button href="/demo" variant="link" className="mt-2.5">
        Ver la demo
      </Button>
    </aside>
  );
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

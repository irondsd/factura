import Link from "next/link";
import { Badge } from "@/components/ui";
import type { Norma } from "@/content/normativa/normas";
import { cn } from "@/lib/cn";

// One law, one card. A ledger card in the site's paper voice: hairline border,
// square corners, mono everywhere except the title.
//
// The card is built around `estado`, because that's the question this page
// answers that a bare list of links doesn't. A derogated norm keeps its card —
// people still quote the Ley de Alquileres — but it announces itself: the badge
// takes the accent (the palette has no red, and accent is the "look here" colour
// here), and `estadoNota` moves up under the title, ahead of the summary. What
// no longer applies has to be readable before the description that makes it
// sound like it does.

const ESTADO_LABEL = {
  vigente: "Vigente",
  modificada: "Vigente con cambios",
  derogada: "Derogada",
} as const;

const JURISDICCION_LABEL = {
  nacional: "Nacional",
  caba: "Ciudad de Buenos Aires",
} as const;

/** One label/value row of the card's foot. Wraps to two lines on a phone
 * rather than squeezing the value into a column two words wide. */
function Dato({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-0.5 sm:grid-cols-[minmax(0,116px)_minmax(0,1fr)] sm:gap-4">
      <dt className="fd-label pt-px">{label}</dt>
      <dd className="m-0 font-mono text-[13px] leading-[1.6] text-ink">
        {children}
      </dd>
    </div>
  );
}

export function NormaCard({
  norma,
  /** Title of the guide named by `norma.guia`, when it resolves to one. */
  guiaTitulo,
}: {
  norma: Norma;
  guiaTitulo?: string;
}) {
  const derogada = norma.estado === "derogada";

  return (
    <article
      id={norma.id}
      className="fd-card flex scroll-mt-20 flex-col p-5 sm:p-6"
    >
      {/* ── Head ───────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <a
          href={`#${norma.id}`}
          className={cn(
            "font-mono text-[12px] uppercase tracking-label no-underline transition-colors hover:text-accent",
            derogada ? "text-muted" : "text-accent",
          )}
        >
          {norma.numero}
        </a>
        <Badge tone={derogada ? "accent" : "neutral"} className="flex-none">
          {ESTADO_LABEL[norma.estado]}
        </Badge>
      </div>

      <h3 className="mt-2 mb-0 font-display text-[20px] font-semibold leading-[1.25] tracking-tight text-ink">
        {norma.titulo}
      </h3>

      {/* The status note outranks the summary — see the note at the top. */}
      {norma.estadoNota && (
        <p className="mt-3 mb-0 border-l-2 border-[var(--accent-line)] pl-3 font-mono text-[12.5px] leading-[1.6] text-ink">
          {norma.estadoNota}
        </p>
      )}

      <p className="mt-3 mb-0 font-mono text-[13.5px] leading-[1.7] text-muted">
        {norma.resumen}
      </p>

      {/* ── Foot ───────────────────────────────────────────────── */}
      {/* A flexible spacer rather than `mt-auto` on the <dl>: it pushes the foot
          to the bottom of a stretched card — so two cards side by side line
          their rules up despite summaries of different lengths — while still
          holding a real minimum gap when the card isn't stretched at all. */}
      <div className="min-h-6 flex-1" aria-hidden="true" />

      <dl className="m-0 flex flex-col gap-2 border-t border-line pt-4">
        <Dato label="Jurisdicción">
          {JURISDICCION_LABEL[norma.jurisdiccion]}
        </Dato>
        <Dato label="Sancionada">{norma.sancion}</Dato>
        {norma.controla && <Dato label="Controla">{norma.controla}</Dato>}
        {norma.dondeAparece && (
          <Dato label="Dónde aparece">
            <span className="text-muted">{norma.dondeAparece}</span>
          </Dato>
        )}
      </dl>

      <div className="mt-5 flex flex-wrap items-baseline gap-x-5 gap-y-2">
        <a
          href={norma.fuente.href}
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono text-[12.5px] text-accent underline decoration-dotted underline-offset-[3px] hover:decoration-solid"
        >
          {norma.fuente.label} ↗
        </a>
        {norma.guia && guiaTitulo && (
          <Link
            href={`/guias/${norma.guia}`}
            className="font-mono text-[12.5px] text-muted no-underline transition-colors hover:text-accent"
          >
            Guía: {guiaTitulo} →
          </Link>
        )}
      </div>
    </article>
  );
}

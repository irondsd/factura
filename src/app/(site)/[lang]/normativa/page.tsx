import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/article/Breadcrumbs";
import { Eyebrow, SHELL } from "@/components/landing/parts";
import { NormaCard } from "@/components/normativa/NormaCard";
import { JsonLd } from "@/components/seo/JsonLd";
import { Button } from "@/components/ui";
import { listedGuides } from "@/content/guias/guides";
import { GRUPOS, NORMAS, normasDeGrupo } from "@/content/normativa/normas";
import { normativaMetadata } from "@/i18n/metadata";
import { normativaLd } from "@/i18n/structuredData";

// Spanish-only reference page: the norms that produce the lines on an Argentine
// household's bills and contracts. Copy is inlined in Spanish, like /guias and
// /estadisticas — the page never renders in English, so there is no translation
// to keep in the dictionary.
//
// The content is entirely in `content/normativa/normas.ts`; this file is layout.
// The one thing it computes is the guide titles: the registry stores a slug, and
// a link that says "Guía: cómo leer la boleta de ABL de AGIP" has to get that
// wording from the guide itself or the two drift the first time one is retitled.
//
// REVISADO is shown to the reader on purpose. A page of laws is only as good as
// the day it was last checked, and the honest move is to say which day that was
// rather than let a 2026 status read as permanent.

const TITLE = "Normativa: las leyes detrás de lo que pagas";
const DESCRIPTION =
  "Las leyes y decretos que regulan alquileres, expensas, luz, gas, agua e internet en Argentina y en CABA: qué dice cada una, si sigue vigente y dónde leer el texto oficial.";
const INTRO =
  "Cada renglón de una factura y cada cláusula de un contrato salen de alguna norma. Aquí están las que importan para un hogar, con lo que dicen en castellano llano, si siguen en pie y un enlace al texto oficial para verificarlo por tu cuenta.";
const REVISADO = "agosto de 2026";

export function generateMetadata(): Metadata {
  return normativaMetadata({ title: TITLE, description: DESCRIPTION });
}

export default async function NormativaPage() {
  // Slug → title, so a card can name the guide it points at. A slug with no
  // matching guide simply renders no link (the test keeps that from happening
  // silently), which is also what drafts and unlisted guides should do.
  const guides = await listedGuides();
  const guiaTitulos = new Map(guides.map((g) => [g.slug, g.meta.title]));

  return (
    <>
      <JsonLd
        data={normativaLd({
          title: TITLE,
          description: DESCRIPTION,
          normas: [...NORMAS],
        })}
      />

      <main className={SHELL}>
        <Breadcrumbs
          className="pt-10"
          items={[
            { name: "Inicio", href: "/" },
            { name: "Normativa", href: "/normativa" },
          ]}
        />

        {/* ── Head ─────────────────────────────────────────────── */}
        <header className="max-w-[680px] pt-7 pb-2">
          <h1 className="font-display font-semibold text-[36px] sm:text-[46px] tracking-[-0.025em] leading-[1.05] mt-0 mb-0">
            {TITLE}
          </h1>
          <p className="font-mono text-[15px] leading-[1.7] text-muted mt-[18px] mb-0">
            {INTRO}
          </p>
          {/* The caveat belongs with the cards, not in a section of its own:
              this is orientación, and half of what's here changed since 2023. */}
          <p className="font-mono text-[12.5px] leading-[1.65] text-muted mt-5 border-l-2 border-[var(--accent-line)] pl-3.5">
            {`Esto es información general para orientarte, no asesoramiento legal. Las normas cambian —varias de las que están aquí cambiaron desde 2023— y solo el texto oficial es el que vale. Revisado en ${REVISADO}.`}
          </p>
        </header>

        {/* ── Section index ────────────────────────────────────── */}
        <nav aria-label="Secciones" className="mt-9 border-t border-line pt-5">
          <div className="mb-2.5">
            <Eyebrow>En esta página</Eyebrow>
          </div>
          <ol className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2 list-none p-0 m-0">
            {GRUPOS.map((grupo, i) => (
              <li key={grupo.id}>
                <a
                  href={`#${grupo.id}`}
                  className="font-mono text-[13px] text-muted no-underline transition-colors hover:text-accent"
                >
                  <span className="text-accent">
                    {String(i + 1).padStart(2, "0")}
                  </span>{" "}
                  {grupo.label}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        {/* ── Groups ───────────────────────────────────────────── */}
        <div className="mt-14 mb-16 flex flex-col gap-14">
          {GRUPOS.map((grupo) => {
            const normas = normasDeGrupo(grupo.id);
            return (
              <section key={grupo.id} id={grupo.id} className="scroll-mt-20">
                <div className="flex items-baseline justify-between gap-4 border-b border-line pb-3">
                  <h2 className="font-display font-semibold text-[24px] sm:text-[27px] tracking-[-0.02em] text-ink m-0">
                    {grupo.label}
                  </h2>
                  <Eyebrow className="flex-none">
                    {normas.length} {normas.length === 1 ? "norma" : "normas"}
                  </Eyebrow>
                </div>

                <p className="font-mono text-[13.5px] leading-[1.7] text-muted max-w-[68ch] mt-4 mb-0">
                  {grupo.blurb}
                </p>

                {/* `items-stretch` is what lets each card's foot rule line up
                    with its neighbour's — see the spacer in NormaCard. */}
                <div className="mt-6 grid items-stretch gap-4 md:grid-cols-2">
                  {normas.map((norma) => (
                    <NormaCard
                      key={norma.id}
                      norma={norma}
                      guiaTitulo={
                        norma.guia ? guiaTitulos.get(norma.guia) : undefined
                      }
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>

        {/* ── Closing CTA ──────────────────────────────────────── */}
        <section className="fd-card mb-16 px-7 pt-9 pb-12 text-center">
          <h2 className="font-display font-semibold text-[28px] tracking-tight m-0 mb-2">
            Saber qué dice la ley es la mitad
          </h2>
          <p className="font-mono text-sm text-muted m-0 mb-[22px]">
            La otra mitad es tener tus facturas ordenadas para poder reclamar.
            Subes el PDF y Factura lo lee por ti.
          </p>
          <Button href="/probar" variant="solid" size="xl">
            Probar con una factura
          </Button>
        </section>
      </main>
    </>
  );
}

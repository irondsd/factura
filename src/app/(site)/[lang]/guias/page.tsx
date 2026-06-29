import type { Metadata } from "next";
import Link from "next/link";
import { Eyebrow, SHELL } from "@/components/landing/parts";
import { JsonLd } from "@/components/seo/JsonLd";
import { siteUrl } from "@/config/urls";
import { allGuides } from "@/content/guias/guides";
import { guidesIndexMetadata, guidesIndexUrl } from "@/i18n/metadata";
import { breadcrumbLd, guideListLd } from "@/i18n/structuredData";

// Spanish-only guides index. Copy is inlined in Spanish (no dictionary lookup):
// the section never renders in English, so there's no translation to maintain.

const TITLE = "Guías para entender tus facturas";
const DESCRIPTION =
  "Guías claras sobre facturas de luz, gas y agua: cómo leerlas, qué significan los cargos y cómo controlar los gastos del hogar.";
const INTRO =
  "Artículos prácticos para entender qué pagas en cada servicio y cómo llevar el control de tus facturas, sin tecnicismos.";

export function generateMetadata(): Metadata {
  return guidesIndexMetadata({ title: TITLE, description: DESCRIPTION });
}

const fmtDate = (iso: string) =>
  new Intl.DateTimeFormat("es-AR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(iso));

export default async function GuiasIndexPage() {
  const guides = await allGuides();

  return (
    <>
      <JsonLd
        data={guideListLd(
          guides.map((g) => ({
            slug: g.slug,
            title: g.meta.title,
            description: g.meta.description,
          })),
        )}
      />
      <JsonLd
        data={breadcrumbLd([
          { name: "Inicio", url: siteUrl },
          { name: "Guías", url: guidesIndexUrl },
        ])}
      />

      <main className={SHELL}>
        <header className="max-w-[640px] pt-14 pb-2">
          <Eyebrow tone="accent">Guías</Eyebrow>
          <h1 className="font-display font-semibold text-[36px] sm:text-[46px] tracking-[-0.025em] leading-[1.05] mt-[18px] mb-0">
            {TITLE}
          </h1>
          <p className="font-mono text-[15px] leading-[1.7] text-muted mt-[18px] mb-0">
            {INTRO}
          </p>
        </header>

        <ul className="mt-12 mb-16 list-none p-0 border-t border-line">
          {guides.map((g) => (
            <li key={g.slug} className="border-b border-line">
              <Link
                href={`/guias/${g.slug}`}
                className="group block no-underline py-7"
              >
                <div className="flex items-baseline justify-between gap-4">
                  <h2 className="font-display font-semibold text-[22px] sm:text-[25px] tracking-tight text-ink m-0 transition-colors group-hover:text-accent">
                    {g.meta.title}
                  </h2>
                  <span className="flex-none font-mono text-micro uppercase tracking-label-wide text-muted">
                    {fmtDate(g.meta.published)}
                  </span>
                </div>
                <p className="font-mono text-sm leading-[1.7] text-muted max-w-[70ch] mt-2 mb-0">
                  {g.meta.summary}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </>
  );
}

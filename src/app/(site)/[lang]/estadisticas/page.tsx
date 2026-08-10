import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/article/Breadcrumbs";
import { StatsList } from "@/components/estadisticas/StatsList";
import { SHELL } from "@/components/landing/parts";
import { JsonLd } from "@/components/seo/JsonLd";
import { statsChildren } from "@/content/estadisticas/pages";
import { statsIndexMetadata } from "@/i18n/metadata";
import { statsIndexLd } from "@/i18n/structuredData";

// The /estadisticas index. Spanish-only, so the copy is inlined in Spanish
// rather than looked up — the section never renders in English (see the layout).
//
// It lists the *top-level* pages only. A statistic with per-province pages under
// it is one entry here and lists its own children on its page, which is what
// keeps this index a short table of contents rather than a directory of every
// district as the section grows.

const TITLE = "Estadísticas de precios y servicios en Argentina";
const DESCRIPTION =
  "Datos oficiales sobre lo que cuesta mantener un hogar en Argentina: inflación de vivienda, agua, luz y gas por región, en series mensuales actualizadas.";
const INTRO =
  "Series de datos públicos sobre los precios del hogar, ordenadas y graficadas para que se puedan leer de un vistazo. Cada página cita su fuente y se actualiza cuando el organismo publica el dato nuevo.";

export function generateMetadata(): Metadata {
  return statsIndexMetadata({ title: TITLE, description: DESCRIPTION });
}

export default async function EstadisticasIndexPage() {
  const pages = await statsChildren([]);

  return (
    <>
      <JsonLd
        data={statsIndexLd({
          title: TITLE,
          description: DESCRIPTION,
          pages: pages.map((p) => ({ slug: p.slug, title: p.meta.title })),
        })}
      />

      <main className={SHELL}>
        <Breadcrumbs
          className="pt-10"
          items={[
            { name: "Inicio", href: "/" },
            { name: "Estadísticas", href: "/estadisticas" },
          ]}
        />

        <header className="max-w-[640px] pt-7 pb-2">
          <h1 className="font-display font-semibold text-[36px] sm:text-[46px] tracking-[-0.025em] leading-[1.05] mt-0 mb-0">
            {TITLE}
          </h1>
          <p className="font-mono text-[15px] leading-[1.7] text-muted mt-[18px] mb-0">
            {INTRO}
          </p>
        </header>

        <div className="mt-12 mb-16 border-t border-line">
          <StatsList pages={pages} />
        </div>
      </main>
    </>
  );
}

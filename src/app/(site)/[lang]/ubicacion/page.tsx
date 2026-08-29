import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs } from "@/components/article/Breadcrumbs";
import { Eyebrow, SHELL } from "@/components/landing/parts";
import { JsonLd } from "@/components/seo/JsonLd";
import { nonEmptyContentLocations } from "@/content-system/repository/locations";
import { locationsIndexMetadata } from "@/i18n/metadata";
import { locationsIndexLd } from "@/i18n/structuredData";

const TITLE = "Contenido por ubicación";
const DESCRIPTION =
  "Guías, noticias, estadísticas e investigaciones de Factura organizadas por la ubicación geográfica que analizan.";
export function generateMetadata(): Metadata {
  return locationsIndexMetadata({ title: TITLE, description: DESCRIPTION });
}

export default async function LocationsPage() {
  const locations = await nonEmptyContentLocations();
  return (
    <>
      <JsonLd data={locationsIndexLd(locations)} />
      <main className={SHELL}>
        <Breadcrumbs
          className="pt-10"
          items={[
            { name: "Inicio", href: "/" },
            { name: "Ubicaciones", href: "/ubicacion" },
          ]}
        />
        <header className="max-w-[680px] pt-7 pb-2">
          <Eyebrow tone="accent">Geografía</Eyebrow>
          <h1 className="mt-[18px] mb-0 font-display text-[36px] leading-[1.05] font-semibold tracking-[-0.025em] sm:text-[46px]">
            {TITLE}
          </h1>
          <p className="mt-[18px] mb-0 font-mono text-[15px] leading-[1.7] text-muted">
            {DESCRIPTION}
          </p>
        </header>
        {locations.length ? (
          <ul className="mt-12 mb-16 grid list-none gap-4 p-0 sm:grid-cols-2">
            {locations.map((location) => (
              <li key={location.id}>
                <Link
                  href={`/ubicacion/${location.slug}`}
                  className="block h-full border border-line bg-card px-5 py-5 text-ink no-underline transition-colors hover:border-accent"
                >
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="font-display text-[21px] font-semibold tracking-[-0.015em]">
                      {location.label}
                    </span>
                    <span className="font-mono text-micro tracking-label-wide text-muted uppercase">
                      {location.total}{" "}
                      {location.total === 1 ? "página" : "páginas"}
                    </span>
                  </span>
                  <span className="mt-2 block font-mono text-[13px] leading-[1.6] text-muted">
                    {location.description}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-12 mb-16 border-y border-line py-6 font-mono text-[13px] text-muted">
            Todavía no hay contenido publicado con ubicación.
          </p>
        )}
      </main>
    </>
  );
}

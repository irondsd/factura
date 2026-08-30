import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs } from "@/components/article/Breadcrumbs";
import { LocationTagLabel } from "@/components/article/LocationTagLabel";
import { Eyebrow, SHELL } from "@/components/landing/parts";
import { JsonLd } from "@/components/seo/JsonLd";
import { badgeClass } from "@/components/ui/Badge";
import { groupLocationsByInitial } from "@/content-system/locations/alphabetize";
import { nonEmptyContentLocations } from "@/content-system/repository/locations";
import { locationsIndexMetadata } from "@/i18n/metadata";
import { locationsIndexLd } from "@/i18n/structuredData";
import { cn } from "@/lib/cn";

const TITLE = "Contenido por ubicación";
const DESCRIPTION =
  "Guías, noticias, estadísticas e investigaciones de Factura organizadas por la ubicación geográfica que analizan.";
export function generateMetadata(): Metadata {
  return locationsIndexMetadata({ title: TITLE, description: DESCRIPTION });
}

export default async function LocationsPage() {
  const locations = await nonEmptyContentLocations();
  const groups = groupLocationsByInitial(locations);
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
        {groups.length ? (
          <div className="mt-12 mb-16 flex flex-col gap-10">
            {groups.map((group) => (
              <section
                key={group.letter}
                aria-labelledby={`letra-${group.letter}`}
              >
                <h2
                  id={`letra-${group.letter}`}
                  className="m-0 border-b border-line pb-3 font-display text-[27px] font-semibold tracking-[-0.02em]"
                >
                  {group.letter}
                </h2>
                <ul className="mt-4 mb-0 grid list-none gap-3 p-0 sm:grid-cols-2 lg:grid-cols-3">
                  {group.locations.map((location) => (
                    <li key={location.id}>
                      <Link
                        href={`/ubicacion/${location.slug}`}
                        className="flex h-full items-center justify-between gap-4 border border-line bg-card px-4 py-4 text-ink no-underline transition-colors hover:border-accent"
                      >
                        <span
                          className={cn(
                            badgeClass("neutral"),
                            "px-2.5 py-1.5 text-ink",
                          )}
                        >
                          <LocationTagLabel label={location.label} />
                        </span>
                        <span className="font-mono text-micro tracking-label-wide text-muted uppercase">
                          {location.total}{" "}
                          {location.total === 1 ? "página" : "páginas"}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        ) : (
          <p className="mt-12 mb-16 border-y border-line py-6 font-mono text-[13px] text-muted">
            Todavía no hay contenido publicado con ubicación.
          </p>
        )}
      </main>
    </>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs } from "@/components/article/Breadcrumbs";
import { LocationTagLabel } from "@/components/article/LocationTagLabel";
import { Eyebrow, SHELL } from "@/components/landing/parts";
import { JsonLd } from "@/components/seo/JsonLd";
import { groupLocationsByInitial } from "@/content-system/locations/alphabetize";
import { nonEmptyContentLocations } from "@/content-system/repository/locations";
import { locationsIndexMetadata } from "@/i18n/metadata";
import { locationsIndexLd } from "@/i18n/structuredData";

const TITLE = "Contenido por ubicación";
const DESCRIPTION =
  "Guías, noticias, estadísticas e investigaciones de Factura organizadas por la ubicación geográfica que analizan.";

/** The jump bar shows all 26 letters, not just the ones in use: a gap is
 * information — it says "nothing is filed under J" — and a strip that changes
 * length as the archive grows stops being a fixed landmark. Letters outside
 * A–Z (a label starting with a digit, say) simply get no jump target; the
 * group below still renders and is still reachable by scrolling. */
const ALPHABET = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"];

const JUMP_LETTER =
  "flex h-8 items-center justify-center font-mono text-[13px] font-medium sm:h-auto sm:text-[11px] sm:tracking-[0.1em]";

export function generateMetadata(): Metadata {
  return locationsIndexMetadata({ title: TITLE, description: DESCRIPTION });
}

export default async function LocationsPage() {
  const locations = await nonEmptyContentLocations();
  const groups = groupLocationsByInitial(locations);
  const filled = new Set(groups.map((group) => group.letter));
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
          <Eyebrow>Geografía</Eyebrow>
          <h1 className="mt-2.5 mb-0 font-display text-[30px] leading-[1.05] font-semibold tracking-[-0.02em] sm:text-[40px]">
            {TITLE}
          </h1>
          <p className="mt-4 mb-0 font-mono text-[13px] leading-[1.6] text-muted">
            {DESCRIPTION}
          </p>
        </header>
        {groups.length ? (
          <>
            {/* Nine columns on a phone puts all 26 letters in three rows of
                real 32px tap targets; on a wider screen they collapse to a
                single wrapped line pinned under the title. */}
            <nav
              aria-label="Saltar a una inicial"
              className="mt-4 mb-5 grid grid-cols-9 gap-0.5 border-y border-ink py-2.5 sm:mb-[26px] sm:flex sm:flex-wrap sm:gap-x-2.5 sm:gap-y-0.5"
            >
              {ALPHABET.map((letter) =>
                filled.has(letter) ? (
                  <a
                    key={letter}
                    href={`#letra-${letter}`}
                    className={`${JUMP_LETTER} text-ink no-underline transition-colors hover:text-accent`}
                  >
                    {letter}
                  </a>
                ) : (
                  <span
                    key={letter}
                    aria-hidden="true"
                    className={`${JUMP_LETTER} text-muted-faint`}
                  >
                    {letter}
                  </span>
                ),
              )}
            </nav>
            <div className="mb-16">
              {groups.map((group) => (
                <section
                  key={group.letter}
                  id={`letra-${group.letter}`}
                  aria-labelledby={`inicial-${group.letter}`}
                  className="scroll-mt-6 border-b border-line/80 py-3 sm:flex sm:gap-[22px]"
                >
                  <h2
                    id={`inicial-${group.letter}`}
                    className="m-0 mb-2 font-display text-[15px] leading-[1.2] font-semibold text-accent sm:mb-0 sm:w-4 sm:flex-none"
                  >
                    {group.letter}
                  </h2>
                  <ul className="m-0 flex list-none flex-col gap-2.5 p-0 sm:flex-1 sm:flex-row sm:flex-wrap sm:gap-x-[18px] sm:gap-y-1.5">
                    {group.locations.map((location) => (
                      <li key={location.id}>
                        <Link
                          href={`/ubicacion/${location.slug}`}
                          className="flex min-h-6 items-baseline gap-1.5 text-ink no-underline transition-colors hover:text-accent sm:inline-flex sm:min-h-0"
                        >
                          <LocationTagLabel label={location.label} />
                          {/* `ml-auto` drives the count to the right edge of
                              the stacked phone row; on a wide screen the rows
                              become inline tags and it sits next to the name. */}
                          <span className="ml-auto font-mono text-[12px] text-muted sm:ml-0 sm:text-[11px]">
                            {location.total}
                            <span className="sr-only">
                              {" "}
                              {location.total === 1 ? "página" : "páginas"}
                            </span>
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </>
        ) : (
          <p className="mt-12 mb-16 border-y border-line py-6 font-mono text-[13px] text-muted">
            Todavía no hay contenido publicado con ubicación.
          </p>
        )}
      </main>
    </>
  );
}

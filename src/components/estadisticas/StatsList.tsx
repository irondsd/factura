import Link from "next/link";
import { type StatsPage, statsHref } from "@/content/estadisticas/pages";

// The row list of statistics pages, shared by the section index and by a hub
// page listing its children, so the two can't drift. Same shape as the guides'
// `GuideList`, with one deliberate difference: the timestamp shown is `updated`,
// not `published`.
//
// That difference is the section. A guide is written once and is as good a year
// later; a statistics page is a series that gains a point every month, and the
// only date a reader cares about is how fresh the numbers are.

const fmtDate = (iso: string) =>
  new Intl.DateTimeFormat("es-AR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(new Date(iso));

export function StatsList({
  pages,
  /** Heading level for the titles — the index nests them under its <h1>, so h2
   * there; a hub page listing children under a section <h2> makes them h3. */
  titleAs: Title = "h2",
}: {
  pages: StatsPage[];
  titleAs?: "h2" | "h3";
}) {
  return (
    <ul className="list-none p-0 m-0">
      {pages.map((p) => (
        <li key={statsHref(p.slug)} className="border-b border-line">
          <Link
            href={statsHref(p.slug)}
            className="group block no-underline py-6"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <Title className="min-w-0 font-display font-semibold text-[20px] sm:text-[23px] tracking-tight text-ink m-0 transition-colors group-hover:text-accent">
                {p.meta.title}
              </Title>
              <span className="flex-none font-mono text-micro uppercase tracking-label-wide text-muted">
                Actualizado el {fmtDate(p.meta.updated)}
              </span>
            </div>
            <p className="font-mono text-sm leading-[1.7] text-muted max-w-[70ch] mt-2 mb-0">
              {p.meta.summary}
            </p>
          </Link>
        </li>
      ))}
    </ul>
  );
}

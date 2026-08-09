import Link from "next/link";
import type { Guide } from "@/content/guias/guides";

// The guide row list, shared by the /guias index sections and the category hub
// pages so the two can't drift. Spanish-only section, so the date format is
// hardcoded es-AR (see the note in guias/layout.tsx).
//
// Rows carry only a bottom border — whatever renders the list is responsible for
// the top rule (on the index that's the section header's own border).

// Date only — listing rows don't need the time. Formatted in Buenos Aires time,
// the offset the timestamps are authored in: under UTC a guide published in the
// local evening would render a day late.
const fmtDate = (iso: string) =>
  new Intl.DateTimeFormat("es-AR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(new Date(iso));

export function GuideList({
  guides,
  /** Heading level for the guide titles. The index nests them under a category
   * <h2>, so they're h3 there; a category page's <h1> makes them h2. */
  titleAs: Title = "h2",
}: {
  guides: Guide[];
  titleAs?: "h2" | "h3";
}) {
  return (
    <ul className="list-none p-0 m-0">
      {guides.map((g) => (
        <li key={g.slug} className="border-b border-line">
          <Link
            href={`/guias/${g.slug}`}
            className="group block no-underline py-6"
          >
            {/* Wraps rather than overflowing: the date is `flex-none` and a
                title only shrinks down to its longest word, so on a narrow
                phone the pair can't fit one line and used to push the row —
                and the page with it — past the viewport. Wrapping drops the
                date onto its own line only when it genuinely doesn't fit; the
                title keeps `min-w-0` so it wraps as text instead of forcing
                the row wide. */}
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <Title className="min-w-0 font-display font-semibold text-[20px] sm:text-[23px] tracking-tight text-ink m-0 transition-colors group-hover:text-accent">
                {g.meta.title}
              </Title>
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
  );
}

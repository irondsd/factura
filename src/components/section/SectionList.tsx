import Link from "next/link";
import type { ContentSection, SectionPage } from "@/content/section";

// The row list of pages, shared by a section index and by a hub page listing its
// children, so the two can't drift — and shared by /estadisticas and
// /investigacion, so those two can't either.
//
// Same shape as the guides' `GuideList`, with one deliberate difference: the
// timestamp shown is `updated`, not `published`.
//
// That difference is what these sections are. A guide is written once and is as
// good a year later; a page here is a series that gains a point every month, or
// a finding recomputed when its inputs move, and the only date a reader cares
// about is how fresh the numbers are.

const fmtDate = (iso: string) =>
  new Intl.DateTimeFormat("es-AR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(new Date(iso));

export function SectionList({
  section,
  pages,
  /** Heading level for the titles — the index nests them under its <h1>, so h2
   * there; a hub page listing children under a section <h2> makes them h3. */
  titleAs: Title = "h2",
}: {
  section: ContentSection;
  pages: SectionPage[];
  titleAs?: "h2" | "h3";
}) {
  return (
    <ul className="list-none p-0 m-0">
      {pages.map((p) => (
        <li key={section.href(p.slug)} className="border-b border-line">
          <Link
            href={section.href(p.slug)}
            className="group flex items-start gap-4 sm:gap-[22px] no-underline py-6"
          >
            {/* Optional, exactly as on a guide row: a page without a preview
                keeps the full-width text row, and the two forms mix in one
                list — which is why the thumbnail is a leading flex item rather
                than a column reserved on every row. `alt=""` because the title
                beside it already names the page. The intrinsic size is the
                file's, so the box is reserved before the image loads. */}
            {p.meta.preview && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={p.meta.preview}
                alt=""
                width={960}
                height={540}
                loading="lazy"
                decoding="async"
                className="flex-none w-[104px] sm:w-40 aspect-video object-cover border border-line bg-card"
              />
            )}
            <div className="min-w-0 flex-1">
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
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

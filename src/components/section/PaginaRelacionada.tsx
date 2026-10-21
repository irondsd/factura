import Link from "next/link";
import { Eyebrow } from "@/components/landing/parts";
import { SECTIONS } from "@/content/sections";

// A card pointing at another page of /estadisticas or /investigaciones, dropped
// into a body wherever the author wants it:
//
//   <PaginaRelacionada href="/estadisticas/alquiler-caba" />
//
// ── Why a card and not the guides' related-articles list ──────────────────
// `RelatedGuides` is a compact row list, and it earns that shape: a guide can
// have five or six neighbours and the block sits above the CTAs, where tall
// cards would bury them. These pages have one or two counterparts each, and
// the relationship is specific — the sale page and the rent page are two
// halves of one question. One card with the target's own summary makes the
// case for the click; a one-line row doesn't.
//
// ── Why the content isn't a prop ──────────────────────────────────────────
// Only the href is. The title, the blurb and the eyebrow come from the target
// page's own `meta` and its own section, so they can't fall out of step with
// it, and an href that doesn't resolve renders no card instead of one that
// links nowhere. Each section memoises its registry, so several of these on a
// page cost one read between them.
//
// ── Why an href and not a slug ────────────────────────────────────────────
// It used to be a bare slug, which was unambiguous while /estadisticas was the
// only section it could mean. It no longer is: a research page's whole job is
// to send the reader back to the series it joined, so most of these cards now
// cross a section boundary. A site-relative path is what the author would write
// in a markdown link anyway, and it is what tells the card whether to say
// "Estadística relacionada" or "Investigación relacionada".

export async function PaginaRelacionada({
  href,
  /** Overrides the target's own `summary` when this particular page has a more
   * specific reason to send the reader there. */
  children,
}: {
  href: string;
  children?: React.ReactNode;
}) {
  const section = SECTIONS.find(
    (s) => href === s.base || href.startsWith(`${s.base}/`),
  );
  if (!section) {
    throw new Error(
      `<PaginaRelacionada href="${href}" />: not a path under ${SECTIONS.map((s) => s.base).join(" or ")}.`,
    );
  }

  const path = href.slice(section.base.length + 1);
  const pages = await section.listed();
  const target = pages.find((p) => section.slugPath(p.slug) === path);
  // A target that is not listed renders no card, and does not fail the build.
  // An href that never resolved is caught earlier, when the page carrying it
  // is published (`@/content-system/validation/links`). What reaches here is a
  // target that was listed then and is not now: taken back to draft or moved
  // into preview by an editor. Throwing made that an outage — every deploy
  // failed on someone else's status change (October 2026: five estadísticas
  // moved to preview). A card to a page readers cannot find is the thing to
  // leave out; the rest of the page is fine.
  if (!target) {
    console.warn(
      `<PaginaRelacionada href="${href}" />: not a listed page right now; card omitted.`,
    );
    return null;
  }

  return (
    <aside className="my-8">
      <Link
        href={section.href(target.slug)}
        className="fd-card group block no-underline px-5 py-4 transition-colors hover:border-accent/40"
      >
        <Eyebrow>{section.relatedLabel}</Eyebrow>

        <div className="mt-2 flex items-baseline justify-between gap-4">
          <span className="min-w-0 font-display font-semibold text-[18px] sm:text-[20px] tracking-tight text-ink transition-colors group-hover:text-accent">
            {target.meta.title}
          </span>
          <span
            aria-hidden="true"
            className="flex-none font-mono text-micro text-accent"
          >
            →
          </span>
        </div>

        {/* A div, not a p: `children` arrives from MDX, which wraps a
            paragraph of prose in its own <p>, and a <p> inside a <p> is
            invalid HTML that React reports as a hydration failure. The child
            selectors restyle that wrapper to the card's compact type, so the
            override reads the same as the fallback summary. */}
        <div className="font-mono text-[13.5px] leading-[1.65] text-muted mt-2 [&>p]:m-0 [&>p]:font-mono [&>p]:text-[13.5px] [&>p]:leading-[1.65] [&>p]:text-muted">
          {children ?? target.meta.summary}
        </div>
      </Link>
    </aside>
  );
}

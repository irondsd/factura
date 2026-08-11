import Link from "next/link";
import { Eyebrow } from "@/components/landing/parts";
import { listedStatsPages, statsHref } from "@/content/estadisticas/pages";

// A card pointing at another statistics page, dropped into a body wherever the
// author wants it:
//
//   <PaginaRelacionada slug="alquiler-caba" />
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
// Only the slug is. The title and the blurb come from the target page's own
// `meta`, so they can't fall out of step with it, and a slug that doesn't
// resolve fails the build instead of rendering a card that links nowhere.
// `pages.ts` memoises the registry, so several of these on a page cost one
// read between them.

export async function PaginaRelacionada({
  slug,
  /** Overrides the target's own `summary` when this particular page has a more
   * specific reason to send the reader there. */
  children,
}: {
  slug: string;
  children?: React.ReactNode;
}) {
  const pages = await listedStatsPages();
  const target = pages.find((p) => p.slug.join("/") === slug);
  if (!target) {
    throw new Error(
      `<PaginaRelacionada slug="${slug}" />: no such statistics page. Known: ${pages
        .map((p) => p.slug.join("/"))
        .join(", ")}`,
    );
  }

  return (
    <aside className="my-8">
      <Link
        href={statsHref(target.slug)}
        className="fd-card group block no-underline px-5 py-4 transition-colors hover:border-accent/40"
      >
        <Eyebrow>Estadística relacionada</Eyebrow>

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

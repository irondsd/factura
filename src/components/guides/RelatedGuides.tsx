import Link from "next/link";
import { Eyebrow } from "@/components/landing/parts";

// The "Guías relacionadas" block that guides drop into their body with a bare
// <RelatedGuides /> (see AUTHORING.md §5). The tag carries no props: the article
// route injects the already-resolved list through the MDX `components` prop, so
// authors control *placement* and the page controls *content*.
//
// Deliberately compact — it sits between the article's closing section and its
// CTAs, where full summary cards would bury the call to action.

/** A page this block links to. Deliberately just a slug and a title: the
 * filesystem registry and the database repository describe a guide very
 * differently, and this component needs neither description. */
export type RelatedLink = { slug: string; title: string };

export function RelatedGuides({ guides }: { guides: readonly RelatedLink[] }) {
  if (guides.length === 0) return null;

  return (
    <aside className="my-12 border-t border-b border-line py-6">
      <Eyebrow>Guías relacionadas</Eyebrow>

      <ul className="mt-4 list-none p-0 m-0 flex flex-col">
        {guides.map((g) => (
          <li key={g.slug}>
            <Link
              href={`/guias/${g.slug}`}
              className="group flex items-baseline justify-between gap-4 py-[10px] no-underline"
            >
              <span className="font-mono text-[13.5px] leading-[1.5] text-ink transition-colors group-hover:text-accent">
                {g.title}
              </span>
              <span
                aria-hidden="true"
                className="flex-none font-mono text-micro text-accent"
              >
                →
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </aside>
  );
}

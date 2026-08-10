import Link from "next/link";
import { JsonLd } from "@/components/seo/JsonLd";
import { siteUrl } from "@/config/urls";
import { breadcrumbLd } from "@/i18n/structuredData";

// Visible breadcrumb trail for the guides section, plus the matching
// BreadcrumbList JSON-LD. Both come from the same `items` array: Google wants
// the markup to describe a trail the user can actually see, so keeping one
// source here means the two can never drift.
//
// Spanish-only, like the rest of /guias — labels are inline, no dictionary.

export type Crumb = {
  name: string;
  /** Site-relative path, e.g. "/" or "/guias/como-leer-la-factura-de-edenor". */
  href: string;
};

/** Absolute URL for a crumb — BreadcrumbList `item` must be fully qualified. */
const absolute = (href: string) =>
  href === "/" ? siteUrl : `${siteUrl}${href}`;

export function Breadcrumbs({
  items,
  className,
}: {
  items: Crumb[];
  className?: string;
}) {
  return (
    <>
      <JsonLd
        data={breadcrumbLd(
          items.map(({ name, href }) => ({ name, url: absolute(href) })),
        )}
      />

      <nav aria-label="Ruta de navegación" className={className}>
        <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 list-none p-0 m-0 font-mono text-micro uppercase tracking-label-wide text-muted">
          {items.map((item, i) => {
            const isLast = i === items.length - 1;
            return (
              <li
                key={item.href}
                className="flex min-w-0 max-w-full items-center gap-x-2"
              >
                {i > 0 && (
                  <span aria-hidden="true" className="flex-none text-line">
                    /
                  </span>
                )}
                {isLast ? (
                  // The current page: text, not a link. `aria-current` marks it
                  // for screen readers without adding a self-referential link.
                  // Guide titles are long, so this crumb truncates rather than
                  // wrapping into a three-line block on narrow screens.
                  <span aria-current="page" className="truncate text-ink">
                    {item.name}
                  </span>
                ) : (
                  <Link
                    href={item.href}
                    className="flex-none no-underline transition-colors hover:text-accent"
                  >
                    {item.name}
                  </Link>
                )}
              </li>
            );
          })}
        </ol>
      </nav>
    </>
  );
}

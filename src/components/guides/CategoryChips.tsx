import Link from "next/link";
import { Button } from "@/components/ui";
import { badgeClass } from "@/components/ui/Badge";
import { cn } from "@/lib/cn";
import type { ContentCategory } from "@/content-system/categories/types";
import type { ContentSection } from "@/content-system/types";

// Row of category links. On the /guias index it's the topic switcher (and the
// only internal link some category hubs get, so it doubles as their entry
// point); on an article it shows that guide's own categories.
//
// Two looks, because those are two different invitations. On an index the row
// is the control a reader uses to move around, so it is buttons. In an article
// header it is a *statement* — what this page is filed under — sitting between
// the dateline and the prose, where a row of buttons would compete with the
// one call to action the header is meant to carry. Same links either way: a
// category flag that navigates nowhere would strand the hubs it feeds.

export function CategoryChips({
  categories,
  section = "guias",
  label,
  variant = "button",
  className,
}: {
  categories: readonly ContentCategory[];
  section?: ContentSection;
  /** Accessible name for the nav landmark — the chips are just labels, so
   * without this a screen reader gets two unlabelled lists on the same page. */
  label: string;
  /** `button` on an index, `badge` in an article header. */
  variant?: "button" | "badge";
  className?: string;
}) {
  if (categories.length === 0) return null;

  return (
    <nav aria-label={label} className={className}>
      <ul className="flex flex-wrap gap-2 list-none p-0 m-0">
        {categories.map((c) => (
          <li key={c.id}>
            {variant === "badge" ? (
              <Link
                href={`/${section}/categoria/${c.slug}`}
                className={cn(
                  badgeClass("neutral"),
                  // Ink rather than the neutral badge's muted: this is the
                  // page's own filing, not a status flag on someone else's row.
                  // The roomier padding is what keeps a 10px tracked label a
                  // comfortable tap target.
                  "px-2.5 py-1.5 text-ink no-underline transition-colors hover:border-accent hover:text-accent",
                )}
              >
                {c.label}
              </Link>
            ) : (
              <Button href={`/${section}/categoria/${c.slug}`} size="sm">
                {c.label}
              </Button>
            )}
          </li>
        ))}
      </ul>
    </nav>
  );
}

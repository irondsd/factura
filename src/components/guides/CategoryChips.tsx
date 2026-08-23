import { Button } from "@/components/ui";
import type { ContentCategory } from "@/content-system/categories/types";
import type { ContentSection } from "@/content-system/types";

// Row of category links. On the /guias index it's the topic switcher (and the
// only internal link some category hubs get, so it doubles as their entry
// point); on an article it shows that guide's own categories.

export function CategoryChips({
  categories,
  section = "guias",
  label,
  className,
}: {
  categories: readonly ContentCategory[];
  section?: ContentSection;
  /** Accessible name for the nav landmark — the chips are just labels, so
   * without this a screen reader gets two unlabelled lists on the same page. */
  label: string;
  className?: string;
}) {
  if (categories.length === 0) return null;

  return (
    <nav aria-label={label} className={className}>
      <ul className="flex flex-wrap gap-2 list-none p-0 m-0">
        {categories.map((c) => (
          <li key={c.id}>
            <Button href={`/${section}/categoria/${c.slug}`} size="sm">
              {c.label}
            </Button>
          </li>
        ))}
      </ul>
    </nav>
  );
}

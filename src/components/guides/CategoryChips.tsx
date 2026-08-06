import { Button } from "@/components/ui";
import type { Category } from "@/content/guias/categories";

// Row of category links. On the /guias index it's the topic switcher (and the
// only internal link some category hubs get, so it doubles as their entry
// point); on an article it shows that guide's own categories.

export function CategoryChips({
  categories,
  label,
  className,
}: {
  categories: Category[];
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
            <Button href={`/guias/categoria/${c.id}`} size="sm">
              {c.label}
            </Button>
          </li>
        ))}
      </ul>
    </nav>
  );
}

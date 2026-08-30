import Link from "next/link";
import type { ContentLocation } from "@/content-system/locations/types";
import { badgeClass } from "@/components/ui/Badge";
import { cn } from "@/lib/cn";
import { LocationTagLabel } from "./LocationTagLabel";

export function LocationLinks({
  locations,
  label,
}: {
  locations: readonly ContentLocation[];
  label: string;
}) {
  if (!locations.length) return null;
  return (
    <nav aria-label={label} className="mt-12 border-t border-line pt-6">
      <p className="mb-3 font-mono text-micro tracking-label-wide text-muted uppercase">
        Ubicaciones
      </p>
      <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
        {locations.map((location) => (
          <li key={location.id}>
            <Link
              href={`/ubicacion/${location.slug}`}
              className={cn(
                badgeClass("neutral"),
                "px-2.5 py-1.5 text-ink no-underline transition-colors hover:border-accent hover:text-accent",
              )}
            >
              <LocationTagLabel label={location.label} />
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

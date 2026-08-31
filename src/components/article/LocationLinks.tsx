import Link from "next/link";
import type { ContentLocation } from "@/content-system/locations/types";
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
    <nav aria-label={label} className="mt-12 border-t border-line pt-[18px]">
      <p className="fd-label mb-2.5">Ubicaciones</p>
      <ul className="m-0 flex list-none flex-wrap gap-x-[18px] gap-y-1.5 p-0">
        {locations.map((location) => (
          <li key={location.id}>
            <Link
              href={`/ubicacion/${location.slug}`}
              className="inline-flex text-ink no-underline transition-colors hover:text-accent"
            >
              <LocationTagLabel label={location.label} />
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

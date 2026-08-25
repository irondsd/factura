import { cn } from "@/lib/cn";
import { formatContentDateShort } from "@/lib/content-date";

// The line under a headline that says when the page was written and how long it
// takes to read.
//
// One component for every section, so the guide header and the statistics
// header cannot drift apart — they did differ, and the only difference worth
// keeping is which of the two dates leads.
//
// Short dates ("20 ago 2026"), not the long form with the time of day. Three
// timestamped items on one tracked uppercase line is more width than a phone
// has, and the minute a guide was published is not a fact any reader needs.

export type DatelineLead =
  /** Guides and news: written on a date, occasionally revised. */
  | "published"
  /** Statistics and research: the page's whole claim is "these are the current
   * numbers", so the last update is the headline fact and the original
   * publication is provenance. */
  | "updated";

export function ArticleDateline({
  published,
  updated,
  minutes,
  lead = "published",
  className,
}: {
  /** May be null for a page that has never been published, in which case the
   * line shows only the update. */
  published: string | null;
  updated: string;
  minutes: number;
  lead?: DatelineLead;
  className?: string;
}) {
  const first =
    lead === "updated"
      ? { label: "Actualizado", at: updated }
      : { label: "Publicado", at: published };
  const second =
    lead === "updated"
      ? { label: "Publicado", at: published }
      : { label: "Actualizado", at: updated };

  return (
    // Wraps onto separate lines on a phone rather than truncating. Separators
    // trail their item so a wrapped line never *starts* with a "·", and the
    // reading time always follows, so a trailing dot is never left dangling.
    <p
      className={cn(
        "flex flex-wrap gap-x-2 gap-y-1 font-mono text-micro uppercase tracking-label text-muted",
        className,
      )}
    >
      {first.at && <Stamp label={first.label} at={first.at} />}
      {/* Only when it says something the first stamp did not: a page published
          and never revised carries one date, not the same one twice. */}
      {second.at && second.at !== first.at && (
        <Stamp label={second.label} at={second.at} />
      )}
      <span>{minutes} min de lectura</span>
    </p>
  );
}

function Stamp({ label, at }: { label: string; at: string }) {
  return (
    <span>
      {label} <time dateTime={at}>{formatContentDateShort(at)}</time>
      <span aria-hidden="true"> ·</span>
    </span>
  );
}

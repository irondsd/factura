import Link from "next/link";

/** A thin strip under the demo top bar making clear this is sample data and
 * pointing at sign-up. Static — safe to server-render for indexing. */
export function DemoBanner() {
  return (
    <div className="border-b border-line bg-[var(--accent-soft)]">
      <div className="mx-auto flex max-w-[64rem] flex-wrap items-center justify-between gap-2 py-2 px-5">
        <p className="font-mono text-[11px] text-muted">
          <span className="text-accent uppercase tracking-label">
            Live demo
          </span>{" "}
          · sample data for a fictional apartment. Nothing here is editable.
        </p>
        <Link
          href="/login"
          className="font-mono text-[11px] uppercase tracking-label text-ink no-underline underline-offset-4 decoration-dotted hover:text-accent hover:underline"
        >
          Track your own bills ›
        </Link>
      </div>
    </div>
  );
}

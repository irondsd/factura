import Link from "next/link";
import { getI18n } from "@/i18n/server";

/** A thin strip under the demo top bar making clear this is sample data and
 * pointing at sign-up. Static — safe to server-render for indexing. */
export async function DemoBanner() {
  const { t } = await getI18n();
  return (
    <div className="border-b border-line bg-[var(--accent-soft)]">
      <div className="mx-auto flex max-w-[64rem] flex-wrap items-center justify-between gap-2 py-2 px-5">
        <p className="font-mono text-[11px] text-muted">
          <span className="text-accent uppercase tracking-label">
            {t.demo.liveDemo}
          </span>{" "}
          {t.demo.bannerText}
        </p>
        <Link
          href="/login"
          className="font-mono text-[11px] uppercase tracking-label text-ink no-underline underline-offset-4 decoration-dotted hover:text-accent hover:underline"
        >
          {t.demo.trackOwn}
        </Link>
      </div>
    </div>
  );
}

import type { ReactNode } from "react";
import { SHELL, SiteFoot, SiteTop } from "@/components/landing/chrome";
import { Eyebrow } from "@/components/landing/parts";

// Shared layout for prose policy pages (Privacy, Security): the same marketing
// chrome as Docs/FAQ, a narrow reading column, and a list of titled sections.
// Sections carry an `id` so they can be deep-linked.

export type LegalSection = { id: string; heading: string; body: ReactNode };

const PROSE =
  "font-mono text-sm leading-[1.75] text-muted max-w-[68ch] " +
  "[&_p]:mb-3.5 " +
  "[&_a]:text-accent [&_a]:underline [&_a]:decoration-dotted [&_a]:underline-offset-[3px] " +
  "[&_strong]:text-ink [&_strong]:font-medium";

export function LegalPage({
  active,
  eyebrow,
  title,
  intro,
  updated,
  sections,
}: {
  active: string;
  eyebrow: string;
  title: string;
  intro: ReactNode;
  updated: string;
  sections: LegalSection[];
}) {
  return (
    <>
      <SiteTop active={active} />

      <main className={SHELL}>
        {/* ── Head ─────────────────────────────────────────────── */}
        <header className="max-w-[680px] pt-14 pb-2">
          <Eyebrow tone="accent">{eyebrow}</Eyebrow>
          <h1 className="font-display font-semibold text-[36px] sm:text-[46px] tracking-[-0.025em] leading-[1.05] mt-[18px] mb-0">
            {title}
          </h1>
          <p className="font-mono text-[15px] leading-[1.7] text-muted mt-[18px] mb-0">
            {intro}
          </p>
          <p className="font-mono text-micro uppercase tracking-label-wide text-muted mt-5">
            Last updated · {updated}
          </p>
        </header>

        {/* table of contents */}
        <nav className="max-w-[680px] mt-9 border-t border-line pt-5">
          <ol className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2 list-none p-0 m-0">
            {sections.map((s, i) => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  className="font-mono text-[13px] text-muted no-underline transition-colors hover:text-accent"
                >
                  <span className="text-accent">
                    {String(i + 1).padStart(2, "0")}
                  </span>{" "}
                  {s.heading}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        {/* ── Sections ─────────────────────────────────────────── */}
        <div className="max-w-[680px] pb-16">
          {sections.map((s) => (
            <section key={s.id} id={s.id} className="pt-11 scroll-mt-24">
              <h2 className="font-display font-semibold text-[23px] sm:text-[25px] tracking-tight m-0 mb-4">
                {s.heading}
              </h2>
              <div className={PROSE}>{s.body}</div>
            </section>
          ))}
        </div>
      </main>

      <SiteFoot />
    </>
  );
}

/** A hairline-marked bullet list in the policy voice. */
export function Bullets({ items }: { items: ReactNode[] }) {
  return (
    <ul className="list-none p-0 my-3.5 flex flex-col gap-2">
      {items.map((it, i) => (
        <li key={i} className="flex gap-2.5">
          <span className="flex-none text-accent select-none">—</span>
          <span className="flex-1">{it}</span>
        </li>
      ))}
    </ul>
  );
}

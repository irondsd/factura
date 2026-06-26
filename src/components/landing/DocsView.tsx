"use client";

import { useEffect, useMemo, useState } from "react";
import { Eyebrow } from "@/components/landing/parts";
import { useI18n } from "@/i18n/I18nProvider";
import { cn } from "@/lib/cn";

// Public docs. A sticky table of contents on the left, one article on the right,
// switched client-side with the URL hash as the address (so /docs#first-bill
// deep-links straight to a page — the FAQ relies on that). Content is real, not
// stubbed: it tracks how the app actually behaves, and lives in the dictionary
// (t.docs.items) so it translates with the rest of the site. Article bodies are
// trusted, author-controlled HTML strings; the <article> container below carries
// the prose styling via descendant selectors, so the HTML stays class-free.

const PAGER_LABEL =
  "block font-mono text-[10px] uppercase tracking-[0.18em] text-muted mb-1";

// Prose styling for the rendered HTML bodies — mirrors the old H2/P/UL/LI/Code/
// Callout/Example components, keyed off the semantic tags the dictionary emits.
const PROSE = cn(
  "[&_h2]:font-display [&_h2]:font-semibold [&_h2]:text-[22px] [&_h2]:tracking-[-0.01em] [&_h2]:mt-10 [&_h2]:mb-0",
  "[&_p]:font-mono [&_p]:text-sm [&_p]:leading-[1.75] [&_p]:mt-3.5 [&_p]:max-w-[64ch] [&_p]:text-ink",
  "[&_p.muted]:text-muted",
  "[&_ul]:list-none [&_ul]:p-0 [&_ul]:mt-4 [&_ul]:max-w-[64ch] [&_ul]:flex [&_ul]:flex-col [&_ul]:gap-2.5",
  "[&_li]:relative [&_li]:pl-[22px] [&_li]:font-mono [&_li]:text-sm [&_li]:leading-[1.6] [&_li]:text-ink [&_li]:before:content-['—'] [&_li]:before:absolute [&_li]:before:left-0 [&_li]:before:text-accent",
  "[&_code]:font-mono [&_code]:text-[0.9em] [&_code]:bg-[var(--accent-soft)] [&_code]:border [&_code]:border-line [&_code]:px-[5px] [&_code]:py-px [&_code]:text-ink",
  "[&_.callout]:mt-6 [&_.callout]:max-w-[64ch] [&_.callout]:border [&_.callout]:border-[var(--accent-line)] [&_.callout]:bg-[var(--accent-soft)] [&_.callout]:px-[18px] [&_.callout]:py-4",
  "[&_.callout-label]:block [&_.callout-label]:font-mono [&_.callout-label]:text-[10px] [&_.callout-label]:uppercase [&_.callout-label]:tracking-[0.2em] [&_.callout-label]:text-accent [&_.callout-label]:mb-1.5",
  "[&_.callout_p]:text-[13.5px] [&_.callout_p]:leading-[1.7] [&_.callout_p]:mt-0",
  "[&_.example]:mt-6 [&_.example]:max-w-[64ch] [&_.example]:border [&_.example]:border-line [&_.example]:bg-card",
  "[&_.example_figcaption]:font-mono [&_.example_figcaption]:text-[10px] [&_.example_figcaption]:uppercase [&_.example_figcaption]:tracking-[0.18em] [&_.example_figcaption]:text-muted [&_.example_figcaption]:px-4 [&_.example_figcaption]:py-2.5 [&_.example_figcaption]:border-b [&_.example_figcaption]:border-line",
  "[&_.example_pre]:m-0 [&_.example_pre]:px-4 [&_.example_pre]:pt-2 [&_.example_pre]:pb-4 [&_.example_pre]:font-mono [&_.example_pre]:text-[12.5px] [&_.example_pre]:text-ink [&_.example_pre]:whitespace-pre-wrap",
  "[&_.accent]:text-accent",
  "[&_a]:text-accent [&_a]:underline [&_a]:decoration-dotted [&_a]:underline-offset-[3px]",
);

export function DocsView() {
  const { t } = useI18n();
  const docs = t.docs.items;

  const [current, setCurrent] = useState(docs[0].id);

  // Stable lookups (ids are locale-independent), rebuilt only if docs change.
  const byId = useMemo(
    () => Object.fromEntries(docs.map((d) => [d.id, d])),
    [docs],
  );
  const groups = useMemo(
    () =>
      docs.reduce<{ label: string; ids: string[] }[]>((acc, d) => {
        const bucket = acc.find((g) => g.label === d.group);
        if (bucket) bucket.ids.push(d.id);
        else acc.push({ label: d.group, ids: [d.id] });
        return acc;
      }, []),
    [docs],
  );

  // Adopt the URL hash on mount and follow back/forward navigation.
  useEffect(() => {
    const fromHash = () => {
      const id = window.location.hash.slice(1);
      if (id && byId[id]) setCurrent(id);
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, [byId]);

  const select = (id: string, scroll: boolean) => {
    setCurrent(id);
    history.replaceState(null, "", `#${id}`);
    if (scroll) window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const doc = byId[current] ?? docs[0];
  const idx = docs.findIndex((d) => d.id === doc.id);
  const prev = idx > 0 ? docs[idx - 1] : null;
  const next = idx < docs.length - 1 ? docs[idx + 1] : null;

  const linkClass =
    "block w-full text-left cursor-pointer bg-transparent border-none py-1.5 px-0 font-mono text-[13px] text-muted transition-colors hover:text-ink";

  return (
    <div className="grid grid-cols-1 md:grid-cols-[248px_minmax(0,1fr)] gap-8 md:gap-14 pt-8 md:pt-12 pb-[72px] items-start">
      {/* ── Table of contents ── */}
      <aside className="md:sticky md:top-[84px]">
        <div className="mb-[18px]">
          <Eyebrow tone="accent">{t.docs.tocEyebrow}</Eyebrow>
        </div>
        <nav>
          {groups.map((g) => (
            <div key={g.label} className="mb-[22px]">
              <span className="block font-mono text-[10px] uppercase tracking-[0.18em] text-muted mb-2.5">
                {g.label}
              </span>
              <ul className="list-none m-0 p-0 flex flex-col gap-0.5 md:flex-col flex-wrap">
                {g.ids.map((id) => (
                  <li key={id}>
                    <button
                      type="button"
                      onClick={() => select(id, true)}
                      className={cn(
                        linkClass,
                        id === current &&
                          "text-accent! underline decoration-dotted underline-offset-4",
                      )}
                    >
                      {byId[id].title}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </aside>

      {/* ── Article ── */}
      <article className="min-w-0">
        <div className="mb-3.5">
          <Eyebrow>{doc.group}</Eyebrow>
        </div>
        <h1 className="font-display font-semibold text-[32px] md:text-[38px] tracking-[-0.02em] leading-[1.1] mt-2 mb-0">
          {doc.title}
        </h1>
        <p className="font-mono text-[15px] leading-[1.7] text-muted mt-[18px] mb-0 max-w-[62ch]">
          {doc.lede}
        </p>

        {/* Body is trusted dictionary content authored alongside the app;
            PROSE is scoped here so it doesn't leak onto the lede/heading. */}
        <div className={PROSE} dangerouslySetInnerHTML={{ __html: doc.body }} />

        {/* prev / next */}
        <div className="mt-12 pt-[22px] border-t border-line flex justify-between gap-4 flex-wrap">
          {prev ? (
            <button
              type="button"
              onClick={() => select(prev.id, true)}
              className="bg-transparent border-none cursor-pointer text-left font-mono text-[13px] text-muted transition-colors hover:text-accent"
            >
              <span className={PAGER_LABEL}>{t.docs.prev}</span>
              {prev.title}
            </button>
          ) : (
            <span />
          )}
          {next && (
            <button
              type="button"
              onClick={() => select(next.id, true)}
              className="ml-auto bg-transparent border-none cursor-pointer text-right font-mono text-[13px] text-muted transition-colors hover:text-accent"
            >
              <span className={PAGER_LABEL}>{t.docs.next}</span>
              {next.title}
            </button>
          )}
        </div>
      </article>
    </div>
  );
}

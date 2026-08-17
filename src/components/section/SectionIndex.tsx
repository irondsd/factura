import { Breadcrumbs } from "@/components/article/Breadcrumbs";
import { ClosingCta } from "@/components/guides/cta";
import { SHELL } from "@/components/landing/parts";
import { SectionList } from "@/components/section/SectionList";
import { JsonLd } from "@/components/seo/JsonLd";
import type { ContentSection } from "@/content/section";
import { sectionIndexLd } from "@/i18n/structuredData";

// A section index — /estadisticas and /investigacion. Spanish-only, so the copy
// each route passes in is written in Spanish rather than looked up: the sections
// never render in English (see their layouts).
//
// It lists the *top-level* pages only. A subject with per-district pages under it
// is one entry here and lists its own children on its page, which is what keeps
// this index a short table of contents rather than a directory of every district
// as the section grows.

export async function SectionIndex({
  section,
  title,
  description,
  intro,
  closing,
}: {
  section: ContentSection;
  /** <h1> and <title>. */
  title: string;
  /** <meta name="description">, and the CollectionPage's. */
  description: string;
  /** The paragraph under the headline. */
  intro: string;
  /** The index had no offer of any kind: a visitor who arrived here from search
   * read five titles and left. The pitch is the section's own to make, so each
   * one writes it. */
  closing: { title: string; body: React.ReactNode };
}) {
  const pages = await section.children([]);

  return (
    <>
      <JsonLd
        data={sectionIndexLd({
          id: section.id,
          title,
          description,
          pages: pages.map((p) => ({ slug: p.slug, title: p.meta.title })),
        })}
      />

      <main className={SHELL}>
        <Breadcrumbs
          className="pt-10"
          items={[
            { name: "Inicio", href: "/" },
            { name: section.label, href: section.base },
          ]}
        />

        <header className="max-w-[640px] pt-7 pb-2">
          <h1 className="font-display font-semibold text-[36px] sm:text-[46px] tracking-[-0.025em] leading-[1.05] mt-0 mb-0">
            {title}
          </h1>
          <p className="font-mono text-[15px] leading-[1.7] text-muted mt-[18px] mb-0">
            {intro}
          </p>
        </header>

        <div className="mt-12 border-t border-line">
          <SectionList section={section} pages={pages} />
        </div>

        {/* Held to the article column so it doesn't stretch across the full
            shell. */}
        <div className="max-w-[760px] pb-16">
          <ClosingCta title={closing.title}>{closing.body}</ClosingCta>
        </div>
      </main>
    </>
  );
}

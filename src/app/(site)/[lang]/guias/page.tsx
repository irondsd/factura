import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/article/Breadcrumbs";
import { CategoryChips } from "@/components/guides/CategoryChips";
import { GuideList } from "@/components/guides/GuideList";
import { Eyebrow, SHELL } from "@/components/landing/parts";
import { JsonLd } from "@/components/seo/JsonLd";
import { Button } from "@/components/ui";
import {
  guidesByPrimaryCategory,
  nonEmptyCategories,
  publishedGuides,
} from "@/content-system/repository/guias";
import { guidesIndexMetadata } from "@/i18n/metadata";
import { guideListLd } from "@/i18n/structuredData";

// Spanish-only guides index. Copy is inlined in Spanish (no dictionary lookup):
// the section never renders in English, so there's no translation to maintain.
//
// Guides are grouped by their PRIMARY category (the first id in
// `meta.categories`), which is what keeps a multi-category guide from appearing
// in three sections of the same page. The full tag set is what the category hubs
// list — so a section's "ver las N" count is the hub's count, and can be larger
// than the handful shown here.

const TITLE = "Guías para entender tus facturas";
const DESCRIPTION =
  "Guías claras sobre facturas de luz, gas y agua: cómo leerlas, qué significan los cargos y cómo controlar los gastos del hogar.";
const INTRO =
  "Artículos prácticos para entender qué pagas en cada servicio y cómo llevar el control de tus facturas, sin tecnicismos.";

/** How many guides each category section shows before deferring to its hub. */
const PER_SECTION = 4;

export function generateMetadata(): Metadata {
  return guidesIndexMetadata({ title: TITLE, description: DESCRIPTION });
}

export default async function GuiasIndexPage() {
  const [guides, sections, categories] = await Promise.all([
    publishedGuides(),
    guidesByPrimaryCategory(),
    nonEmptyCategories(),
  ]);

  return (
    <>
      <JsonLd
        data={guideListLd(
          guides.map((g) => ({
            slug: g.slug,
            title: g.title,
            description: g.description,
          })),
        )}
      />

      <main className={SHELL}>
        <Breadcrumbs
          className="pt-10"
          items={[
            { name: "Inicio", href: "/" },
            { name: "Guías", href: "/guias" },
          ]}
        />

        {/* No "Guías" eyebrow here — the breadcrumb above already names the
            section, and the two stacked labels read as a duplicate. */}
        <header className="max-w-[640px] pt-7 pb-2">
          <h1 className="font-display font-semibold text-[36px] sm:text-[46px] tracking-[-0.025em] leading-[1.05] mt-0 mb-0">
            {TITLE}
          </h1>
          <p className="font-mono text-[15px] leading-[1.7] text-muted mt-[18px] mb-0">
            {INTRO}
          </p>
        </header>

        <CategoryChips
          categories={categories}
          label="Temas de las guías"
          className="mt-8"
        />

        <div className="mt-14 mb-16 flex flex-col gap-14">
          {sections.map(({ category, guides: shown, total }) => (
            <section key={category.id}>
              <div className="flex items-baseline justify-between gap-4 border-b border-line pb-3">
                <h2 className="font-display font-semibold text-[24px] sm:text-[27px] tracking-[-0.02em] text-ink m-0">
                  {category.label}
                </h2>
                <Eyebrow className="flex-none">
                  {total} {total === 1 ? "guía" : "guías"}
                </Eyebrow>
              </div>

              <GuideList guides={shown.slice(0, PER_SECTION)} titleAs="h3" />

              {/* Shown whenever the hub holds more than this section does —
                  either because we truncated, or because guides tagged with the
                  category lead with a different one. */}
              {total > Math.min(shown.length, PER_SECTION) && (
                <Button
                  href={`/guias/categoria/${category.slug}`}
                  variant="invert"
                  size="lg"
                  // Visible label leaves the category name out — the section
                  // heading two rows up already says it, and spelling it out
                  // wrapped the button onto two lines on a phone. The aria-label
                  // keeps the full phrase for anyone tabbing link to link.
                  aria-label={`Ver las ${total} guías de ${category.label}`}
                  className="mt-5"
                >
                  Ver las {total} guías →
                </Button>
              )}
            </section>
          ))}
        </div>
      </main>
    </>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { Eyebrow, SHELL } from "@/components/landing/parts";
import { JsonLd } from "@/components/seo/JsonLd";
import { siteUrl } from "@/config/urls";
import { guideSlugs, loadGuide } from "@/content/guias/guides";
import { guideMetadata, guidesIndexUrl, guideUrl } from "@/i18n/metadata";
import { breadcrumbLd, guideLd } from "@/i18n/structuredData";

// One guide article. Static set only — `dynamicParams = false` 404s any slug
// that isn't a real `.mdx` file. (The Spanish-only guard lives in the layout.)
export const dynamicParams = false;

export function generateStaticParams() {
  return guideSlugs().map((slug) => ({ slug }));
}

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const { meta } = await loadGuide(slug);
  return guideMetadata({ slug, ...meta });
}

const fmtDate = (iso: string) =>
  new Intl.DateTimeFormat("es-AR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(iso));

export default async function GuidePage({ params }: Props) {
  const { slug } = await params;
  const { Content, meta } = await loadGuide(slug);

  return (
    <>
      <JsonLd data={guideLd({ slug, ...meta })} />
      <JsonLd
        data={breadcrumbLd([
          { name: "Inicio", url: siteUrl },
          { name: "Guías", url: guidesIndexUrl },
          { name: meta.title, url: guideUrl(slug) },
        ])}
      />

      <main className={SHELL}>
        <article className="max-w-[680px] pt-14 pb-16">
          <header className="pb-2">
            <Eyebrow tone="accent">Guía</Eyebrow>
            <h1 className="font-display font-semibold text-[34px] sm:text-[44px] tracking-[-0.025em] leading-[1.06] mt-[18px] mb-0">
              {meta.title}
            </h1>
            <p className="font-mono text-micro uppercase tracking-label-wide text-muted mt-5">
              Publicado el {fmtDate(meta.published)}
              {meta.updated !== meta.published &&
                ` · Actualizado el ${fmtDate(meta.updated)}`}
            </p>
          </header>

          <div className="mt-8 border-t border-line pt-2">
            <Content />
          </div>

          <nav className="mt-14 border-t border-line pt-6">
            <Link
              href="/guias"
              className="font-mono text-micro uppercase tracking-label-wide text-muted no-underline transition-colors hover:text-accent"
            >
              ← Todas las guías
            </Link>
          </nav>
        </article>
      </main>
    </>
  );
}

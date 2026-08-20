import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireCmsMember } from "@/cms/auth/requireCmsMember";
import { findEditableSection, publicSectionPath } from "@/cms/sections";
import { cmsPageStore } from "@/cms/server/store";
import { ContentArticle } from "@/components/article/ContentArticle";
import { Faq } from "@/components/article/Faq";
import { RelatedGuides } from "@/components/guides/RelatedGuides";
import { JsonLd } from "@/components/seo/JsonLd";
import { getCategory } from "@/content/guias/categories";
import {
  documentHeadings,
  documentStats,
  relatedDocuments,
} from "@/content-system/document";
import { mediaComponents } from "@/content-system/media/render";
import { resolveMediaRef } from "@/content-system/media/repository";
import {
  compileContentForPreview,
  ContentGrammarError,
  contentComponents,
} from "@/content-system/render/renderContent";
import { MissingComponent } from "@/cms/components/MissingComponent";
import { StatusChip } from "@/cms/components/StatusChip";
import { faqPageLd, guideLd } from "@/i18n/structuredData";

// The exact private preview (cms.md §3.2, Phase 6): the last *saved* value,
// rendered through the same `<ContentArticle>` shell, the same component
// manifest and the same structured data as the public page.
//
// Deliberately outside `CmsShell` — this is what the page looks like, not what
// the editor looks like around it. It is also why the route is a sibling of the
// editor rather than a child: a child would inherit the editor's layout.
//
// Never cached, at either layer: an editor who saves and previews must see what
// they just saved, not a copy from thirty seconds ago.
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

// Never indexable and carrying no canonical: this URL is behind authentication,
// it is not the page's real address, and a canonical here would point crawlers
// at a preview.
export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
  alternates: {},
};

type Props = { params: Promise<{ section: string; id: string }> };

export default async function CmsPreviewPage({ params }: Props) {
  const { section: segment, id } = await params;
  await requireCmsMember(`/cms/${segment}/preview/${id}`);

  const section = findEditableSection(segment);
  if (!section) notFound();

  const page = await cmsPageStore.findById(id);
  if (!page || page.section !== section.id) notFound();

  let Content:
    | Awaited<ReturnType<typeof compileContentForPreview>>["Content"]
    | null = null;
  // Components the body calls that do not exist yet. They render as nothing
  // rather than taking the whole preview down with them — see
  // `compileContentForPreview`.
  let missing: string[] = [];
  let grammarError: string | null = null;
  try {
    ({ Content, missing } = await compileContentForPreview(
      page.body,
      page.section,
    ));
  } catch (cause) {
    // A draft may be unfinished, and its grammar errors belong in the
    // Validation tab — so the preview says what is wrong rather than throwing a
    // stack trace into an iframe.
    grammarError =
      cause instanceof ContentGrammarError
        ? cause.diagnostics
            .map((d) => `Línea ${d.line ?? "?"}: ${d.message}`)
            .join("\n")
        : String(cause);
  }

  // Related pages come from the *published* set, which is what the public page
  // will see. A brand-new draft therefore shows the fallback — the newest other
  // guides — exactly as it would once published, rather than an empty block
  // that hides how the page will actually look.
  const published = (
    await cmsPageStore.list({ section: section.id, statuses: ["published"] })
  ).filter((candidate) => candidate.id !== page.id);
  const related = relatedDocuments(page, published);

  const categories = (page.metadata.categories ?? [])
    .map(getCategory)
    .filter((category) => category !== undefined);

  const { words, minutes } = documentStats(page);
  const headings = documentHeadings(page);
  const faq = page.metadata.faq ?? [];

  if (grammarError) {
    return (
      <main className="mx-auto w-full max-w-[680px] px-5 py-10">
        <Banner status={page.status} missing={missing} />
        <div className="border border-[var(--vendor-ochre)] px-4 py-4">
          <p className="font-mono text-[13px] leading-[1.6] text-ink mt-0 mb-2">
            Esta versión no se puede mostrar todavía:
          </p>
          <pre className="font-mono text-[12px] leading-[1.6] text-muted whitespace-pre-wrap m-0">
            {grammarError}
          </pre>
        </div>
      </main>
    );
  }

  return (
    <ContentArticle
      title={page.title}
      href={`${publicSectionPath(section.id)}/${page.slug}`}
      published={page.publishedAt}
      updated={page.contentUpdatedAt}
      cta={page.cta}
      previewMedia={await resolveMediaRef(page.metadata.previewMediaId)}
      previewImage={page.metadata.previewImage}
      categories={categories}
      headings={headings}
      minutes={minutes}
      banner={<Banner status={page.status} missing={missing} />}
      structuredData={
        <>
          {/* The same structured data the public page emits, so it can be read
              before publication rather than after. The route is `noindex`, so
              nothing here is a claim to a crawler. */}
          <JsonLd
            data={guideLd({
              slug: page.slug,
              title: page.title,
              description: page.description,
              keywords: page.metadata.keywords ?? [],
              published: page.publishedAt ?? page.contentUpdatedAt,
              updated: page.contentUpdatedAt,
              vendor: page.metadata.vendor,
              canonical: page.canonicalSlug ?? undefined,
              section: categories[0]?.label,
              words,
              minutes,
            })}
          />
          {faq.length > 0 && <JsonLd data={faqPageLd(faq, "es")} />}
        </>
      }
    >
      {Content && (
        <Content
          components={contentComponents({
            // The preview resolves media exactly as the public page does, or
            // it would be a preview of a different document.
            ...(await mediaComponents(page.body)),
            RelatedGuides: () => (
              <RelatedGuides
                guides={related.map((candidate) => ({
                  slug: candidate.slug,
                  title: candidate.title,
                }))}
              />
            ),
            Faq: () => <Faq items={faq} />,
            // Last, so a name the manifest does not have resolves to a
            // no-op instead of throwing "Expected component X to be defined"
            // out of the MDX runtime. Whatever props the author wrote on it
            // are dropped with it.
            ...Object.fromEntries(
              missing.map((name) => [
                name,
                () => <MissingComponent name={name} />,
              ]),
            ),
          })}
        />
      )}
    </ContentArticle>
  );
}

/** Says what is being looked at. A preview of a draft looks exactly like the
 * live page — which is the point, and also why it needs a label. */
function Banner({
  status,
  missing,
}: {
  status: Parameters<typeof StatusChip>[0]["status"];
  missing?: string[];
}) {
  return (
    <div className="border-b border-line py-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-mono text-micro uppercase tracking-label-wide text-muted">
          Vista previa · última versión guardada
        </span>
        <StatusChip status={status} />
      </div>
      {/* Named here rather than in the article, because a gap in the page is
          invisible: this is the preview's own chrome saying why the page below
          is missing something. */}
      {missing && missing.length > 0 && (
        <p className="font-mono text-[12px] leading-[1.6] text-muted mt-2 mb-0">
          Sin renderizar,{" "}
          {missing.length === 1 ? "el componente" : "los componentes"}{" "}
          {missing.map((name) => `<${name}>`).join(", ")}{" "}
          {missing.length === 1 ? "no existe" : "no existen"} todavía.
        </p>
      )}
    </div>
  );
}

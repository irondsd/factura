import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireCmsMember } from "@/cms/auth/requireCmsMember";
import { findEditableSection } from "@/cms/sections";
import { cmsPageStore } from "@/cms/server/store";
import {
  compileContent,
  ContentGrammarError,
  contentComponents,
} from "@/content-system/render/renderContent";

// The private preview: the last *saved* value, rendered through the same
// compiler and the same component manifest as the eventual public page.
//
// Deliberately outside `CmsShell` — this is what the page looks like, not what
// the editor looks like around it. It is also why the route is a sibling of the
// editor rather than a child: a child would inherit the editor's layout.
//
// Phase 5 brings it up so the editor's Preview tab has something to show.
// Phase 6 is where its fidelity is verified against the public article shell:
// the table of contents, the FAQ binding, related guides, structured data and
// the `noindex` behaviour of a public `preview` URL.
export const dynamic = "force-dynamic";
export const revalidate = 0;

// Never indexable and never linked: a preview URL is the editor's, and this one
// is behind authentication besides.
export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

type Props = { params: Promise<{ section: string; id: string }> };

export default async function CmsPreviewPage({ params }: Props) {
  const { section: segment, id } = await params;
  await requireCmsMember(`/cms/${segment}/preview/${id}`);

  const section = findEditableSection(segment);
  if (!section) notFound();

  const page = await cmsPageStore.findById(id);
  if (!page || page.section !== section.id) notFound();

  let Content: Awaited<ReturnType<typeof compileContent>> | null = null;
  let error: string | null = null;
  try {
    Content = await compileContent(page.body, page.section);
  } catch (cause) {
    // A draft is allowed to be unfinished, and grammar errors are shown in the
    // Validation tab — so the preview says what is wrong rather than throwing a
    // stack trace into an iframe.
    error =
      cause instanceof ContentGrammarError
        ? cause.diagnostics
            .map((d) => `Línea ${d.line ?? "?"}: ${d.message}`)
            .join("\n")
        : String(cause);
  }

  return (
    <main className="mx-auto w-full max-w-[680px] px-5 py-10">
      {error ? (
        <div className="border border-[var(--vendor-ochre)] px-4 py-4">
          <p className="font-mono text-[13px] leading-[1.6] text-ink mt-0 mb-2">
            Esta versión no se puede mostrar todavía:
          </p>
          <pre className="font-mono text-[12px] leading-[1.6] text-muted whitespace-pre-wrap m-0">
            {error}
          </pre>
        </div>
      ) : (
        <article>
          <h1 className="font-display font-semibold text-[34px] tracking-[-0.025em] leading-[1.06] mt-0 mb-7">
            {page.title}
          </h1>
          {Content && <Content components={contentComponents()} />}
        </article>
      )}
    </main>
  );
}

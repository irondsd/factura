import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireCmsMember } from "@/cms/auth/requireCmsMember";
import { CmsShell } from "@/cms/components/CmsShell";
import { cmsPageMetadata } from "@/cms/metadata";
import { findEditableSection } from "@/cms/sections";

// One section's content list. A thin route adapter: resolve the actor, resolve
// the section, hand off to `src/cms`.
//
// The list itself, its status filter and its search arrive in Phase 5; this
// establishes the URL shape the rest of the CMS hangs off.
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ section: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const section = findEditableSection((await params).section);
  return cmsPageMetadata(section?.label ?? "Sección");
}

export default async function CmsSectionPage({ params }: Props) {
  const { section: segment } = await params;
  const actor = await requireCmsMember(`/cms/${segment}`);

  // A section that is registered but not yet editable 404s rather than
  // rendering an empty editor — same answer as a section that does not exist,
  // because in both cases there is nothing here to edit.
  const section = findEditableSection(segment);
  if (!section) notFound();

  return (
    <CmsShell actor={actor}>
      <h1 className="font-display font-semibold text-[30px] tracking-[-0.025em] leading-[1.1] mt-0 mb-3">
        {section.label}
      </h1>
      <p className="font-mono text-[15px] leading-[1.7] text-ink/90 max-w-[62ch]">
        La lista de contenido y el editor llegan en la siguiente fase. Las
        páginas de esta sección se publican en{" "}
        <code className="font-mono text-[0.9em]">{section.publicPath}</code>.
      </p>
    </CmsShell>
  );
}

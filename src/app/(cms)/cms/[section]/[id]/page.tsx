import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCmsMember } from "@/cms/auth/requireCmsMember";
import { CmsShell } from "@/cms/components/CmsShell";
import { PageEditor } from "@/cms/components/PageEditor";
import { sectionFields } from "@/cms/forms/fields";
import { cmsPageMetadata } from "@/cms/metadata";
import { cmsSectionPath, findEditableSection } from "@/cms/sections";
import { cmsPageStore } from "@/cms/server/store";

// The editor for one page.
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ section: string; id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const page = await cmsPageStore.findById(id);
  return cmsPageMetadata(page?.title || "Editar");
}

export default async function CmsEditPage({ params }: Props) {
  const { section: segment, id } = await params;
  const actor = await requireCmsMember(`/cms/${segment}/${id}`);

  const section = findEditableSection(segment);
  if (!section) notFound();

  const page = await cmsPageStore.findById(id);
  // A page opened under the wrong section's URL is a 404, not a redirect: the
  // form is section-shaped, and rendering a statistics page in the guides form
  // would offer fields it does not have.
  if (!page || page.section !== section.id) notFound();

  // Any other page in the section can be this one's parent — except itself and
  // its own descendants, which `checkHierarchy` refuses on save. Offering them
  // here and rejecting on save would be worse than not offering them.
  const siblings = await cmsPageStore.list({ section: section.id });
  const parentOptions = siblings
    .filter((candidate) => candidate.id !== page.id)
    .filter((candidate) => !candidate.slug.startsWith(`${page.slug}/`))
    .map((candidate) => ({
      value: candidate.id,
      label: `${candidate.title || candidate.slug} — /${candidate.slug}`,
      slug: candidate.slug,
    }));

  return (
    <CmsShell actor={actor}>
      <Link
        href={cmsSectionPath(section.id)}
        className="inline-block font-mono text-micro uppercase tracking-label-wide text-muted no-underline mb-6 hover:text-accent"
      >
        ← {section.label}
      </Link>
      <PageEditor
        section={section}
        page={page}
        fields={sectionFields(section.id)}
        parentOptions={parentOptions}
      />
    </CmsShell>
  );
}

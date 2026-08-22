import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCmsAccess, requireCmsMember } from "@/cms/auth/requireCmsMember";
import { CmsShell } from "@/cms/components/CmsShell";
import { PageEditor } from "@/cms/components/PageEditor";
import { sectionFields } from "@/cms/forms/fields";
import { cmsPageMetadata } from "@/cms/metadata";
import { cmsSectionPath, findEditableSection } from "@/cms/sections";
import { loadPageHistory } from "@/cms/server/pageHistory";
import { cmsContentService } from "@/cms/server/service";
import { cmsPageStore } from "@/cms/server/store";

// The editor for one page.
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ section: string; id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  // Membership first, and a generic title for everyone else.
  //
  // `generateMetadata` runs alongside the page, not after it, so the page
  // component's `requireCmsMember` does not gate this: the title was already
  // rendered into the response body by the time the 404 or the redirect was
  // decided, and it reached both an anonymous caller and a signed-in
  // non-member. cms.md asks for a response that reveals nothing. Checking here also
  // keeps an unauthenticated request from reaching the database at all.
  const access = await getCmsAccess();
  if (access.kind !== "member") return cmsPageMetadata("Editar");

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
  //
  // `state` and `versions` come from the service rather than from a second
  // store read: which copy exists and what it means is a lifecycle question,
  // and a route that answered it itself would be a second implementation of
  // the rule (cms.md).
  const [siblings, history, state, versions, redirects] = await Promise.all([
    cmsPageStore.list({ section: section.id }),
    loadPageHistory(page),
    cmsContentService.getState(actor, id),
    cmsContentService.listVersions(actor, id),
    // Old addresses that still answer for this page. Read here so «Dirección»
    // can show them without the editor asking for them after every rename.
    cmsPageStore.redirectsForPage(id),
  ]);
  // Pages whose path hangs off this one's, and which a rename therefore moves
  // too. The prefix is the whole rule (`planRename`), asked once here so the
  // panel can say how many pages a rename is about to touch.
  const descendants = siblings
    .filter((candidate) => candidate.slug.startsWith(`${page.slug}/`))
    .map((candidate) => candidate.slug);

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
        state={state}
        fields={sectionFields(section.id)}
        parentOptions={parentOptions}
        redirects={redirects}
        descendants={descendants}
        history={history}
        versions={versions}
      />
    </CmsShell>
  );
}

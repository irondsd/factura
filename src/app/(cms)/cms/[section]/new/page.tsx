import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCmsMember } from "@/cms/auth/requireCmsMember";
import { CmsShell } from "@/cms/components/CmsShell";
import { CmsIcon } from "@/cms/icons";
import { NewPageForm } from "@/cms/components/NewPageForm";
import { cmsPageMetadata } from "@/cms/metadata";
import { cmsSectionPath, findEditableSection } from "@/cms/sections";
import { cmsPageStore } from "@/cms/server/store";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ section: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const section = findEditableSection((await params).section);
  return cmsPageMetadata(`Nueva página · ${section?.label ?? ""}`);
}

export default async function CmsNewPage({ params }: Props) {
  const { section: segment } = await params;
  const actor = await requireCmsMember(`/cms/${segment}/new`);

  const section = findEditableSection(segment);
  if (!section) notFound();

  const parentOptions = (await cmsPageStore.list({ section: section.id })).map(
    (candidate) => ({
      value: candidate.id,
      label: `${candidate.title || candidate.slug} — /${candidate.slug}`,
      slug: candidate.slug,
    }),
  );

  return (
    <CmsShell actor={actor}>
      <Link
        href={cmsSectionPath(section.id)}
        className="mb-6 inline-flex items-center gap-2 font-mono text-micro uppercase tracking-label-wide text-muted no-underline hover:text-accent"
      >
        <CmsIcon name="arrowLeft" size="sm" />
        {section.label}
      </Link>
      <h1 className="font-display font-semibold text-[30px] tracking-[-0.025em] leading-[1.1] mt-0 mb-7">
        Nueva página
      </h1>
      <NewPageForm section={section} parentOptions={parentOptions} />
    </CmsShell>
  );
}

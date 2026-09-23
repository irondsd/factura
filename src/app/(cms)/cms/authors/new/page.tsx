import type { Metadata } from "next";
import { requireCmsMember } from "@/cms/auth/requireCmsMember";
import { AuthorForm } from "@/cms/authors/components/AuthorForm";
import { CmsPageHeader } from "@/cms/components/CmsPageHeader";
import { CmsShell } from "@/cms/components/CmsShell";
import { cmsPageMetadata } from "@/cms/metadata";

export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  return cmsPageMetadata("Nuevo autor");
}

export default async function CmsNewAuthorPage() {
  const actor = await requireCmsMember("/cms/authors/new");

  return (
    <CmsShell actor={actor}>
      <CmsPageHeader
        back={{ href: "/cms/authors", label: "Autores" }}
        eyebrow="Personas"
        title="Nuevo autor"
      />
      <div className="mt-8">
        <AuthorForm />
      </div>
    </CmsShell>
  );
}

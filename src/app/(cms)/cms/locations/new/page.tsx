import type { Metadata } from "next";
import { requireCmsMember } from "@/cms/auth/requireCmsMember";
import { CmsPageHeader } from "@/cms/components/CmsPageHeader";
import { CmsShell } from "@/cms/components/CmsShell";
import { NewLocationForm } from "@/cms/locations/components/LocationForms";
import { cmsPageMetadata } from "@/cms/metadata";

export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  return cmsPageMetadata("Nueva ubicación");
}

export default async function CmsNewLocationPage() {
  const actor = await requireCmsMember("/cms/locations/new");

  return (
    <CmsShell actor={actor}>
      <CmsPageHeader
        back={{ href: "/cms/locations", label: "Ubicaciones" }}
        eyebrow="Organización"
        title="Nueva ubicación"
      />
      <div className="mt-8">
        <NewLocationForm />
      </div>
    </CmsShell>
  );
}

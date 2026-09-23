import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireCmsMember } from "@/cms/auth/requireCmsMember";
import { CmsPageHeader } from "@/cms/components/CmsPageHeader";
import { CmsShell } from "@/cms/components/CmsShell";
import { LocationEditor } from "@/cms/locations/components/LocationForms";
import { cmsLocationService } from "@/cms/locations/server/service";
import { cmsPageMetadata } from "@/cms/metadata";
import { CmsNotFoundError } from "@/cms/server/errors";

export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  return cmsPageMetadata("Ubicaciones");
}

export default async function CmsLocationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const actor = await requireCmsMember(`/cms/locations/${id}`);

  const detail = await cmsLocationService.get(actor, id).catch((error) => {
    if (error instanceof CmsNotFoundError) return null;
    throw error;
  });
  // A retired location is not found here, as it is to every write in the
  // service: the list never links to one, and an old bookmark should not offer
  // to edit it.
  if (!detail || detail.retiredAt) notFound();

  const { redirects, ...location } = detail;

  return (
    <CmsShell actor={actor}>
      <CmsPageHeader
        back={{ href: "/cms/locations", label: "Ubicaciones" }}
        eyebrow="Editar ubicación"
        title={location.label}
      />
      <div className="mt-8">
        {/* Not keyed on `lockVersion`: the forms read it from props, so a
            refresh after a save hands them the new one without a remount that
            would also throw away their "Guardado." confirmation. */}
        <LocationEditor location={location} redirects={redirects} />
      </div>
    </CmsShell>
  );
}

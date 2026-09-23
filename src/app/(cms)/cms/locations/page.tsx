import type { Metadata } from "next";
import Link from "next/link";
import { requireCmsMember } from "@/cms/auth/requireCmsMember";
import {
  CmsNewLink,
  CmsNotice,
  CmsPageHeader,
} from "@/cms/components/CmsPageHeader";
import { CmsShell } from "@/cms/components/CmsShell";
import { CmsIcon } from "@/cms/icons";
import { cmsLocationService } from "@/cms/locations/server/service";
import { cmsPageMetadata } from "@/cms/metadata";

export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  return cmsPageMetadata("Ubicaciones");
}

// What the forms say after they navigate back here. A fixed vocabulary rather
// than free text in the URL, so a crafted link cannot put words in the console.
const NOTICES: Record<string, string> = {
  creada: "Ubicación creada.",
  eliminada: "Ubicación eliminada.",
};

type Props = { searchParams: Promise<{ aviso?: string | string[] }> };

export default async function CmsLocationsPage({ searchParams }: Props) {
  const actor = await requireCmsMember("/cms/locations");
  const { aviso } = await searchParams;
  const notice = typeof aviso === "string" ? NOTICES[aviso] : undefined;
  const locations = await cmsLocationService.list(actor);

  return (
    <CmsShell actor={actor}>
      <CmsPageHeader
        back={{ href: "/cms", label: "Secciones" }}
        eyebrow="Organización"
        title="Ubicaciones"
        action={
          <CmsNewLink href="/cms/locations/new">Nueva ubicación</CmsNewLink>
        }
      >
        Son globales para guías, noticias, estadísticas e investigaciones.
        Cambiar una dirección conserva la anterior con una redirección
        permanente.
      </CmsPageHeader>

      {notice && <CmsNotice>{notice}</CmsNotice>}

      {locations.length === 0 ? (
        <p className="mt-8 mb-0 border-y border-line py-6 font-mono text-[13px] text-muted">
          Todavía no hay ubicaciones.
        </p>
      ) : (
        <ul className="mt-8 mb-0 list-none border-t border-line p-0">
          {locations.map((location) => (
            <li key={location.id} className="border-b border-line">
              <Link
                href={`/cms/locations/${location.id}`}
                className="group flex items-center gap-4 py-4 text-ink no-underline"
              >
                <div className="min-w-0 flex-1">
                  <p className="m-0 text-[15px] font-semibold transition-colors group-hover:text-accent">
                    {location.label}
                  </p>
                  <p className="mt-1 mb-0 font-mono text-[12px] break-all text-muted">
                    /ubicacion/{location.slug}
                    <span className="ml-3 whitespace-nowrap">
                      {location.usageCount}{" "}
                      {location.usageCount === 1 ? "página" : "páginas"}
                    </span>
                  </p>
                </div>
                <CmsIcon
                  name="chevronRight"
                  size="md"
                  className="text-muted transition-colors group-hover:text-accent"
                />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </CmsShell>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { requireCmsMember } from "@/cms/auth/requireCmsMember";
import { CampaignForm } from "@/cms/campaigns/components/CampaignForm";
import { CmsShell } from "@/cms/components/CmsShell";
import { cmsPageMetadata } from "@/cms/metadata";

export const dynamic = "force-dynamic";
export function generateMetadata(): Metadata {
  return cmsPageMetadata("Campañas");
}

export default async function CmsCampaignsPage() {
  const actor = await requireCmsMember("/cms/campaigns");
  return (
    <CmsShell actor={actor}>
      <Link
        href="/cms"
        className="font-mono text-micro uppercase tracking-label-wide text-muted no-underline hover:text-accent"
      >
        ← Secciones
      </Link>
      <p className="mt-5 mb-2 font-mono text-micro uppercase tracking-label-wide text-accent">
        Envío manual
      </p>
      <h1 className="m-0 font-display text-[30px] font-semibold tracking-[-0.025em]">
        Campañas
      </h1>
      <p className="mt-3 mb-7 max-w-[70ch] font-mono text-[14px] leading-[1.7] text-muted">
        Escribe un correo en español y envíalo a usuarios registrados. Cada
        persona recibe su propio mensaje.
      </p>
      <CampaignForm />
    </CmsShell>
  );
}

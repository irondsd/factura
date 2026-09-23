import type { Metadata } from "next";
import Link from "next/link";
import { requireCmsMember } from "@/cms/auth/requireCmsMember";
import { CmsShell } from "@/cms/components/CmsShell";
import { InsightManager } from "@/cms/insights/components/InsightManager";
import { cmsInsightService } from "@/cms/insights/server/service";
import { cmsPageMetadata } from "@/cms/metadata";

export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  return cmsPageMetadata("Destacados");
}

export default async function CmsInsightsPage() {
  const actor = await requireCmsMember("/cms/insights");
  const [insights, pages] = await Promise.all([
    cmsInsightService.list(),
    cmsInsightService.pageOptions(actor),
  ]);

  return (
    <CmsShell actor={actor}>
      <Link
        href="/cms"
        className="font-mono text-micro tracking-label-wide text-muted uppercase no-underline transition-colors hover:text-accent"
      >
        ← Secciones
      </Link>
      <p className="mt-5 mb-0 font-mono text-micro tracking-label-wide text-accent uppercase">
        Contenido
      </p>
      <h1 className="mt-2 mb-0 font-display text-[30px] font-semibold tracking-[-0.025em]">
        Destacados
      </h1>
      <p className="mt-3 mb-0 max-w-[68ch] font-mono text-[14px] leading-[1.7] text-muted">
        Datos breves que apuntan a una página. Cada uno aparece en el índice de
        su sección — /guias, /noticias, /estadisticas, /investigaciones — y, si
        lo marcas, también en la portada. Solo se muestran los que apuntan a una
        página publicada.
      </p>

      <InsightManager initialInsights={insights} pages={pages} />
    </CmsShell>
  );
}

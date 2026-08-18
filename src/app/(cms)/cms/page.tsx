import type { Metadata } from "next";
import { requireCmsMember } from "@/cms/auth/requireCmsMember";
import { CmsShell } from "@/cms/components/CmsShell";
import { cmsPageMetadata } from "@/cms/metadata";

// The CMS dashboard. A thin route adapter (cms.md §2.1): it resolves the actor
// and hands off to `src/cms`. No data access, no business rules here.
//
// Dynamic and uncached — it reads the session, and a cached CMS screen would be
// a cached answer to "who is allowed in".
export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  return cmsPageMetadata("Contenido");
}

export default async function CmsHomePage() {
  const actor = await requireCmsMember("/cms");

  return (
    <CmsShell actor={actor}>
      <h1 className="font-display font-semibold text-[30px] tracking-[-0.025em] leading-[1.1] mt-0 mb-3">
        Contenido
      </h1>
      <p className="font-mono text-[15px] leading-[1.7] text-ink/90 max-w-[62ch]">
        La lista de guías y el editor llegan en la siguiente fase. Por ahora
        esta pantalla confirma que el acceso al CMS funciona: si la estás
        viendo, tu cuenta está en{" "}
        <code className="font-mono text-[0.9em]">cms_member</code>.
      </p>
    </CmsShell>
  );
}

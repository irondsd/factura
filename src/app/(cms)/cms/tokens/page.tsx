import type { Metadata } from "next";
import { requireCmsMember } from "@/cms/auth/requireCmsMember";
import { canManageTokens } from "@/cms/auth/policy";
import { TokenManager } from "@/cms/components/TokenManager";
import { CmsShell } from "@/cms/components/CmsShell";
import { cmsPageMetadata } from "@/cms/metadata";
import { listCmsTokens } from "@/cms/mcp/tokens";
import { notFound } from "next/navigation";
export const dynamic = "force-dynamic";
export function generateMetadata(): Metadata {
  return cmsPageMetadata("Tokens MCP");
}
export default async function CmsTokensPage() {
  const actor = await requireCmsMember("/cms/tokens");
  if (!canManageTokens(actor)) notFound();
  return (
    <CmsShell actor={actor}>
      <h1 className="font-display text-[30px] font-semibold mt-0">
        Tokens para CMS MCP
      </h1>
      <p className="font-mono text-[14px] leading-[1.7] text-muted">
        Estos tokens pueden editar contenido público. Se muestran una sola vez y
        vencen a los 90 días.
      </p>
      <TokenManager initial={await listCmsTokens(actor.userId)} />
    </CmsShell>
  );
}

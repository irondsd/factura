import type { Metadata } from "next";
import Link from "next/link";
import { requireCmsMember } from "@/cms/auth/requireCmsMember";
import { CmsShell } from "@/cms/components/CmsShell";
import { cmsPageMetadata } from "@/cms/metadata";
import { UserDirectory } from "@/cms/users/components/UserDirectory";
import { parseCmsUserQuery } from "@/cms/users/query";
import { cmsUserService } from "@/cms/users/server/service";

export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  return cmsPageMetadata("Usuarios");
}

type Props = {
  searchParams: Promise<{
    q?: string | string[];
    orden?: string | string[];
    dir?: string | string[];
    pagina?: string | string[];
  }>;
};

export default async function CmsUsersPage({ searchParams }: Props) {
  const actor = await requireCmsMember("/cms/users");
  const query = parseCmsUserQuery(await searchParams);
  const [page, metrics] = await Promise.all([
    cmsUserService.list(query),
    cmsUserService.metrics(),
  ]);

  return (
    <CmsShell actor={actor}>
      <Link
        href="/cms"
        className="font-mono text-micro tracking-label-wide text-muted uppercase no-underline transition-colors hover:text-accent"
      >
        ← Secciones
      </Link>
      <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="m-0 font-mono text-micro tracking-label-wide text-accent uppercase">
            Producto
          </p>
          <h1 className="mt-2 mb-0 font-display text-[30px] font-semibold tracking-[-0.025em]">
            Usuarios
          </h1>
        </div>
        <span className="border border-line bg-card px-3 py-2 font-mono text-micro tracking-label-wide text-muted uppercase">
          Solo lectura
        </span>
      </div>
      <p className="mt-3 mb-0 max-w-[68ch] font-mono text-[14px] leading-[1.7] text-muted">
        Altas y uso básico de Factura. La actividad se toma del último latido de
        una sesión autenticada; no mostramos ubicaciones, direcciones IP ni el
        contenido de las facturas.
      </p>

      <UserDirectory
        page={page}
        metrics={metrics}
        query={query}
        now={metrics.observedAt}
      />
    </CmsShell>
  );
}

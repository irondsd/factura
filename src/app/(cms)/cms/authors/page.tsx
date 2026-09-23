import type { Metadata } from "next";
import Link from "next/link";
import { requireCmsMember } from "@/cms/auth/requireCmsMember";
import { cmsAuthorService } from "@/cms/authors/server/service";
import {
  CmsNewLink,
  CmsNotice,
  CmsPageHeader,
} from "@/cms/components/CmsPageHeader";
import { CmsShell } from "@/cms/components/CmsShell";
import { CmsIcon } from "@/cms/icons";
import { cmsPageMetadata } from "@/cms/metadata";

export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  return cmsPageMetadata("Autores");
}

// What the form says after it navigates back here. A fixed vocabulary rather
// than free text in the URL, so a crafted link cannot put words in the console.
const NOTICES: Record<string, string> = {
  creado: "Autor creado.",
  actualizado: "Autor actualizado.",
};

type Props = { searchParams: Promise<{ aviso?: string | string[] }> };

export default async function CmsAuthorsPage({ searchParams }: Props) {
  const actor = await requireCmsMember("/cms/authors");
  const { aviso } = await searchParams;
  const notice = typeof aviso === "string" ? NOTICES[aviso] : undefined;
  const authors = await cmsAuthorService.list();

  return (
    <CmsShell actor={actor}>
      <CmsPageHeader
        back={{ href: "/cms", label: "Secciones" }}
        eyebrow="Personas"
        title="Autores"
        action={<CmsNewLink href="/cms/authors/new">Nuevo autor</CmsNewLink>}
      >
        Quién puede firmar o verificar una página. Todavía no se muestran en el
        sitio: por ahora sólo viajan en los datos estructurados de cada
        artículo. No se pueden eliminar.
      </CmsPageHeader>

      {notice && <CmsNotice>{notice}</CmsNotice>}

      {authors.length === 0 ? (
        <p className="mt-8 mb-0 border-y border-line py-6 font-mono text-[13px] text-muted">
          Todavía no hay autores.
        </p>
      ) : (
        <ul className="mt-8 mb-0 list-none border-t border-line p-0">
          {authors.map((author) => (
            <li key={author.id} className="border-b border-line">
              <Link
                href={`/cms/authors/${author.id}`}
                className="group flex items-center gap-4 py-4 text-ink no-underline"
              >
                <div className="min-w-0 flex-1">
                  <p className="m-0 text-[15px] font-semibold transition-colors group-hover:text-accent">
                    {author.name}
                  </p>
                  {author.jobTitle && (
                    <p className="mt-1 mb-0 font-mono text-[12px] text-ink/70">
                      {author.jobTitle}
                    </p>
                  )}
                  <p className="mt-1 mb-0 font-mono text-[12px] break-all text-muted">
                    {author.slug ? `/autores/${author.slug}` : "Sin dirección"}
                    <span className="ml-3 whitespace-nowrap">
                      {author.usageCount}{" "}
                      {author.usageCount === 1 ? "página" : "páginas"}
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

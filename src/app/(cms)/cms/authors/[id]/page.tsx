import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCmsMember } from "@/cms/auth/requireCmsMember";
import { AuthorForm } from "@/cms/authors/components/AuthorForm";
import { cmsAuthorService } from "@/cms/authors/server/service";
import { CmsPageHeader } from "@/cms/components/CmsPageHeader";
import { CmsShell } from "@/cms/components/CmsShell";
import { cmsPageMetadata } from "@/cms/metadata";
import { cmsEditPath } from "@/cms/sections";
import { CmsNotFoundError } from "@/cms/server/errors";

export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  return cmsPageMetadata("Autores");
}

const ROLE_LABEL = { author: "Firma", factChecker: "Verifica" } as const;

export default async function CmsAuthorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const actor = await requireCmsMember(`/cms/authors/${id}`);

  const author = await cmsAuthorService.get(id).catch((error) => {
    if (error instanceof CmsNotFoundError) return null;
    throw error;
  });
  if (!author) notFound();

  return (
    <CmsShell actor={actor}>
      <CmsPageHeader
        back={{ href: "/cms/authors", label: "Autores" }}
        eyebrow="Editar autor"
        title={author.name}
      />

      <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_300px]">
        <AuthorForm author={author} />

        {/* Where the name already appears — the one thing the old modal could
            not show, and the reason a rename deserves a second look. */}
        <aside className="min-w-0">
          <h2 className="m-0 mb-3 border-b border-line pb-2 font-mono text-micro font-normal tracking-label-wide text-muted uppercase">
            {author.usageCount} {author.usageCount === 1 ? "página" : "páginas"}
          </h2>
          {author.usage.length === 0 ? (
            <p className="m-0 font-mono text-[12px] leading-[1.6] text-muted">
              Todavía no firma ni verifica ninguna página.
            </p>
          ) : (
            <ul className="m-0 list-none space-y-3 p-0">
              {author.usage.map((page) => (
                <li key={page.id}>
                  <Link
                    href={cmsEditPath(page.section, page.id)}
                    className="text-[14px] font-semibold text-ink no-underline transition-colors hover:text-accent"
                  >
                    {page.title}
                  </Link>
                  <p className="mt-1 mb-0 font-mono text-[12px] break-all text-muted">
                    /{page.section}/{page.slug} ·{" "}
                    {page.roles.map((role) => ROLE_LABEL[role]).join(" y ")}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </CmsShell>
  );
}

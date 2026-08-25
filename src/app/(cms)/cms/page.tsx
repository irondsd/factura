import type { Metadata } from "next";
import Link from "next/link";
import { AuthorManager } from "@/cms/authors/components/AuthorManager";
import { cmsAuthorService } from "@/cms/authors/server/service";
import { requireCmsMember } from "@/cms/auth/requireCmsMember";
import { CmsShell } from "@/cms/components/CmsShell";
import { cmsPageMetadata } from "@/cms/metadata";
import {
  CMS_SECTIONS,
  cmsSectionPath,
  publicSectionPath,
} from "@/cms/sections";

// The CMS home: which section do you want to edit?
//
// Deliberately not a combined list of every page. The sections do not hold the
// same kind of document — statistics and research carry hierarchy, datasets and
// sources that guides have no concept of — so one list would need a filter on
// every query and a form that changes shape per row. Scoping by URL instead
// keeps each section's list, editor and component palette its own thing, and
// makes a new section a registry entry rather than a fourth special case.
export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  return cmsPageMetadata("Secciones");
}

export default async function CmsHomePage() {
  const actor = await requireCmsMember("/cms");
  const authors = await cmsAuthorService.list();

  return (
    <CmsShell actor={actor}>
      <div className="flex flex-wrap items-baseline justify-between gap-4 mb-3">
        <h1 className="font-display font-semibold text-[30px] tracking-[-0.025em] leading-[1.1] m-0">
          Secciones
        </h1>
        {/* Authors live here rather than in the navigation. The list is two
            people who change about once a year, and a nav entry would give it
            the same weight as a section anyone edits daily. */}
        <AuthorManager initialAuthors={authors} />
      </div>
      <p className="font-mono text-[15px] leading-[1.7] text-ink/90 max-w-[62ch] mb-9">
        Elige qué contenido quieres editar.
      </p>

      <ul className="grid gap-4 sm:grid-cols-2 list-none p-0 m-0">
        {CMS_SECTIONS.map((section) => {
          const planned = section.status === "planned";
          return (
            <li key={section.id}>
              {/* A planned section is shown but not linked: it says what is
                  coming without offering an editor that does not exist yet. */}
              <SectionCard section={section} disabled={planned} />
            </li>
          );
        })}
      </ul>
    </CmsShell>
  );
}

function SectionCard({
  section,
  disabled,
}: {
  section: (typeof CMS_SECTIONS)[number];
  disabled: boolean;
}) {
  const body = (
    <>
      <span className="flex items-baseline gap-3">
        <span className="font-display font-semibold text-[21px] tracking-[-0.015em]">
          {section.label}
        </span>
        <span className="font-mono text-micro uppercase tracking-label-wide text-muted">
          {disabled ? "Próximamente" : publicSectionPath(section.id)}
        </span>
      </span>
      <span className="block font-mono text-[13px] leading-[1.6] text-muted mt-2">
        {section.description}
      </span>
    </>
  );

  const shell = "block border border-line bg-card px-5 py-5 no-underline";

  if (disabled) {
    return <span className={`${shell} text-ink/45`}>{body}</span>;
  }
  return (
    <Link
      href={cmsSectionPath(section.id)}
      className={`${shell} text-ink transition-colors hover:border-accent`}
    >
      {body}
    </Link>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { requireCmsMember } from "@/cms/auth/requireCmsMember";
import { CmsShell } from "@/cms/components/CmsShell";
import { cmsPageMetadata } from "@/cms/metadata";
import { CMS_SECTIONS, cmsSectionPath } from "@/cms/sections";

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

  return (
    <CmsShell actor={actor}>
      <h1 className="font-display font-semibold text-[30px] tracking-[-0.025em] leading-[1.1] mt-0 mb-3">
        Secciones
      </h1>
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
          {disabled ? "Próximamente" : section.publicPath}
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

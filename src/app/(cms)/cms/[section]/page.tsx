import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCmsMember } from "@/cms/auth/requireCmsMember";
import { ContentList } from "@/cms/components/ContentList";
import { CmsShell } from "@/cms/components/CmsShell";
import { ListFilters } from "@/cms/components/ListFilters";
import { cmsPageMetadata } from "@/cms/metadata";
import {
  cmsNewPath,
  cmsSectionPath,
  findEditableSection,
} from "@/cms/sections";
import { cmsPageStore } from "@/cms/server/store";
import {
  CONTENT_STATUSES,
  type ContentStatus,
  isContentStatus,
} from "@/content-system/types";

// One section's content list. A thin route adapter: resolve the actor, resolve
// the section, read through the store, hand off to `src/cms/components`.
export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ section: string }>;
  searchParams: Promise<{ estado?: string; q?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const section = findEditableSection((await params).section);
  return cmsPageMetadata(section?.label ?? "Sección");
}

export default async function CmsSectionPage({ params, searchParams }: Props) {
  const { section: segment } = await params;
  const actor = await requireCmsMember(`/cms/${segment}`);

  // A section that is registered but not yet editable 404s rather than
  // rendering an empty editor — the same answer as a section that does not
  // exist, because in both cases there is nothing here to edit.
  const section = findEditableSection(segment);
  if (!section) notFound();

  const { estado, q } = await searchParams;
  const status = estado && isContentStatus(estado) ? estado : undefined;
  const search = q?.trim() || undefined;

  // Counts come from the unfiltered set so the tabs keep saying how many pages
  // are in each state while you are looking at one of them.
  const all = await cmsPageStore.list({ section: section.id, search });
  const pages = status ? all.filter((page) => page.status === status) : all;

  const counts = Object.fromEntries(
    CONTENT_STATUSES.map((s) => [s, all.filter((p) => p.status === s).length]),
  ) as Record<ContentStatus, number>;

  return (
    <CmsShell actor={actor}>
      <div className="flex flex-wrap items-baseline justify-between gap-4 mb-2">
        <h1 className="font-display font-semibold text-[30px] tracking-[-0.025em] leading-[1.1] m-0">
          {section.label}
        </h1>
        {/* Filled, not outlined: the only control on this screen, and it sits a
            column away from the status labels. An outlined accent box was the
            same shape and the same hue as the «Publicada» chip. */}
        <Link
          href={cmsNewPath(section.id)}
          className="inline-flex items-center gap-2 border border-ink bg-ink px-4 py-2 font-mono text-micro uppercase tracking-label-wide text-paper no-underline transition-colors hover:border-accent hover:bg-accent"
        >
          <span aria-hidden="true">+</span>
          Nueva página
        </Link>
      </div>
      <p className="font-mono text-[13px] text-muted mb-8">
        Se publican en <code className="font-mono">{section.publicPath}</code>.
      </p>

      <ListFilters
        basePath={cmsSectionPath(section.id)}
        state={{ status, search }}
        counts={counts}
        total={all.length}
      />

      <ContentList
        section={section}
        pages={pages}
        emptyMessage={
          search || status
            ? "Ninguna página coincide con este filtro."
            : "Todavía no hay páginas en esta sección."
        }
      />
    </CmsShell>
  );
}

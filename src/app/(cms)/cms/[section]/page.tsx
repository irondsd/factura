import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCmsMember } from "@/cms/auth/requireCmsMember";
import { ContentList } from "@/cms/components/ContentList";
import { ContentColumnSettings } from "@/cms/components/ContentColumnSettings";
import { CmsShell } from "@/cms/components/CmsShell";
import { CategoryManager } from "@/cms/categories/components/CategoryManager";
import { cmsCategoryService } from "@/cms/categories/server/service";
import { ActiveListFilters } from "@/cms/components/ActiveListFilters";
import { ListFilterDialog } from "@/cms/components/ListFilterDialog";
import { ListFilters } from "@/cms/components/ListFilters";
import { buildCmsFilterOptions } from "@/cms/listFilterOptions";
import {
  countActiveCmsFilters,
  filterContentRows,
  parseCmsListQuery,
} from "@/cms/listQuery";
import { cmsPageMetadata } from "@/cms/metadata";
import { CmsIcon } from "@/cms/icons";
import {
  cmsNewPath,
  cmsSectionPath,
  findEditableSection,
  publicSectionPath,
} from "@/cms/sections";
import { cmsLocationService } from "@/cms/locations/server/service";
import { cmsPageHistoryStore } from "@/cms/server/historyStore";
import { cmsPageStore } from "@/cms/server/store";
import { resolveAuthorRefs } from "@/content-system/authors/repository";
import { authorIdsIn } from "@/content-system/authors/types";
import { CONTENT_STATUSES, type ContentStatus } from "@/content-system/types";

// One section's content list. A thin route adapter: resolve the actor, resolve
// the section, read through the store, hand off to `src/cms/components`.
export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ section: string }>;
  searchParams: Promise<{
    estado?: string;
    autor?: string;
    verificador?: string;
    categoria?: string;
    ubicacion?: string;
    cambios?: string;
    orden?: string;
    dir?: string;
  }>;
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

  const query = parseCmsListQuery(await searchParams);
  const activeFilters = countActiveCmsFilters(query);

  // Filtering happens here rather than in SQL: the section is already read
  // whole — the status counts and the filter dialog's options both describe the
  // *unfiltered* section, so narrowing the query would mean a second read to
  // put back what it removed. Sections are a few dozen pages.
  const [all, categories, locations] = await Promise.all([
    cmsPageStore.list({ section: section.id }),
    cmsCategoryService.list(actor, section.id),
    cmsLocationService.options(actor),
  ]);
  const pages = filterContentRows(all, query);

  const counts = Object.fromEntries(
    CONTENT_STATUSES.map((s) => [s, all.filter((p) => p.status === s).length]),
  ) as Record<ContentStatus, number>;

  // One lookup each for the whole list, rather than per row: the accounts
  // behind the two timestamp columns, and the people the credits column names.
  // Both de-duplicate, and across a section's pages both are a handful of ids.
  //
  // Credits resolve across the *whole* section, not the rows that survived the
  // filters: they name the filter dialog's choices too, and a list of authors
  // that shrank to whoever is already selected could never be changed to
  // anybody else.
  const [actors, authors] = await Promise.all([
    cmsPageHistoryStore.actorsById(
      pages.flatMap((page) =>
        [page.createdBy, page.updatedBy].filter((id): id is string => !!id),
      ),
    ),
    resolveAuthorRefs(all.flatMap((page) => authorIdsIn(page.metadata))),
  ]);

  const filterOptions = buildCmsFilterOptions({
    pages: all,
    categories,
    locations,
    authors,
  });

  return (
    <CmsShell actor={actor}>
      <div className="flex flex-wrap items-baseline justify-between gap-4 mb-2">
        <h1 className="font-display font-semibold text-[30px] tracking-[-0.025em] leading-[1.1] m-0">
          {section.label}
        </h1>
        {/* Filled, not outlined: the only control on this screen, and it sits a
            column away from the status labels. An outlined accent box was the
            same shape and the same hue as the «Publicada» chip. */}
        <div className="flex flex-wrap items-center gap-2">
          <CategoryManager
            section={section.id}
            initialCategories={categories}
          />
          <Link
            href={cmsNewPath(section.id)}
            className="inline-flex min-h-8 items-center gap-2 border border-ink bg-ink px-4 py-2 font-mono text-micro uppercase tracking-label-wide text-paper no-underline transition-colors hover:border-accent hover:bg-accent"
          >
            <CmsIcon name="add" size="sm" />
            Nueva página
          </Link>
        </div>
      </div>
      <p className="font-mono text-[13px] text-muted mb-8">
        Se publican en{" "}
        <code className="font-mono">{publicSectionPath(section.id)}</code>.
      </p>

      <ContentColumnSettings
        section={section.id}
        sectionLabel={section.label}
        filters={
          <ListFilters
            basePath={cmsSectionPath(section.id)}
            query={query}
            counts={counts}
            total={all.length}
          />
        }
        actions={
          <ListFilterDialog
            basePath={cmsSectionPath(section.id)}
            query={query}
            options={filterOptions}
            statusCounts={counts}
            total={all.length}
          />
        }
      >
        <ActiveListFilters
          basePath={cmsSectionPath(section.id)}
          query={query}
          options={filterOptions}
        />
        <ContentList
          section={section}
          pages={pages}
          actors={Array.from(actors.entries())}
          authors={Array.from(authors.entries())}
          basePath={cmsSectionPath(section.id)}
          query={query}
          emptyMessage={
            activeFilters > 0
              ? activeFilters > 1
                ? "Ninguna página cumple con todos estos filtros."
                : "Ninguna página coincide con este filtro."
              : "Todavía no hay páginas en esta sección."
          }
        />
      </ContentColumnSettings>
    </CmsShell>
  );
}

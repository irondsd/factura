import { requireCmsMember } from "@/cms/auth/requireCmsMember";
import { CmsPageHeader } from "@/cms/components/CmsPageHeader";
import { CmsShell } from "@/cms/components/CmsShell";
import { cmsPageMetadata } from "@/cms/metadata";
import { TaskBoard } from "@/cms/tasks/components/TaskBoard";
import {
  TaskFilters,
  TaskPagination,
} from "@/cms/tasks/components/TaskFilters";
import { taskFilters, type TaskSearchParams } from "@/cms/tasks/query";
import { cmsTaskService } from "@/cms/tasks/server/service";

export const dynamic = "force-dynamic";
export function generateMetadata() {
  return cmsPageMetadata("Tareas");
}

export default async function CmsTasksPage({
  searchParams,
}: {
  searchParams: Promise<TaskSearchParams>;
}) {
  const actor = await requireCmsMember("/cms/tasks");
  const filters = taskFilters(await searchParams);
  const result = await cmsTaskService.list(actor, {
    view: "board",
    search: filters.search,
    tags: filters.tag ? [filters.tag] : undefined,
    limit: 200,
    offset: (filters.page - 1) * 200,
  });
  return (
    <CmsShell actor={actor}>
      <CmsPageHeader
        back={{ href: "/cms", label: "Secciones" }}
        eyebrow="Trabajo compartido"
        title="Tareas"
      >
        Organiza lo que sigue. Arrastra las tarjetas o cambia su estado.
      </CmsPageHeader>
      <TaskFilters path="/cms/tasks" {...filters} />
      <TaskBoard
        tasks={result.tasks}
        canReorder={!filters.search && !filters.tag && result.total <= 200}
      />
      <TaskPagination
        path="/cms/tasks"
        {...filters}
        total={result.total}
        pageSize={200}
      />
    </CmsShell>
  );
}

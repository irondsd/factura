import { requireCmsMember } from "@/cms/auth/requireCmsMember";
import { CmsShell } from "@/cms/components/CmsShell";
import { cmsPageMetadata } from "@/cms/metadata";
import { TaskBoard } from "@/cms/tasks/components/TaskBoard";
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
  // The whole board, unfiltered: search and tags filter in the browser.
  const [tasks, archive, dismissed, nextNumber] = await Promise.all([
    cmsTaskService.listAll(actor, "board"),
    cmsTaskService.list(actor, { view: "archive", limit: 1 }),
    cmsTaskService.list(actor, { view: "dismissed", limit: 1 }),
    cmsTaskService.nextNumber(),
  ]);
  return (
    <CmsShell actor={actor}>
      <TaskBoard
        tasks={tasks}
        archiveCount={archive.total + dismissed.total}
        nextNumber={nextNumber}
        now={new Date().toISOString()}
        initialSearch={filters.search}
        initialTag={filters.tag}
      />
    </CmsShell>
  );
}

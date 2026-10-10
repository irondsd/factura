import { requireCmsMember } from "@/cms/auth/requireCmsMember";
import { CmsShell } from "@/cms/components/CmsShell";
import { cmsPageMetadata } from "@/cms/metadata";
import { TaskArchive } from "@/cms/tasks/components/TaskArchive";
import { taskFilters, type TaskSearchParams } from "@/cms/tasks/query";
import { cmsTaskService } from "@/cms/tasks/server/service";

export const dynamic = "force-dynamic";
export function generateMetadata() {
  return cmsPageMetadata("Archivo de tareas");
}

export default async function CmsTaskArchivePage({
  searchParams,
}: {
  searchParams: Promise<TaskSearchParams>;
}) {
  const actor = await requireCmsMember("/cms/tasks/archive");
  const params = await searchParams;
  const filters = taskFilters(params);
  // Both tabs at once, so switching between them and searching are instant.
  const [done, dismissed] = await Promise.all([
    cmsTaskService.listAll(actor, "archive"),
    cmsTaskService.listAll(actor, "dismissed"),
  ]);
  return (
    <CmsShell actor={actor}>
      <TaskArchive
        done={done}
        dismissed={dismissed}
        initialTab={params.view === "dismissed" ? "dismissed" : "done"}
        initialSearch={filters.search}
        initialTag={filters.tag}
      />
    </CmsShell>
  );
}

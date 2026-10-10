import { notFound } from "next/navigation";
import { requireCmsMember } from "@/cms/auth/requireCmsMember";
import { CmsShell } from "@/cms/components/CmsShell";
import { cmsPageMetadata } from "@/cms/metadata";
import { CmsNotFoundError } from "@/cms/server/errors";
import { TaskDetail } from "@/cms/tasks/components/TaskDetail";
import { taskIdentifierSchema } from "@/cms/tasks/inputs";
import { taskOrigin, type TaskSearchParams } from "@/cms/tasks/query";
import { cmsTaskService } from "@/cms/tasks/server/service";

export const dynamic = "force-dynamic";
export function generateMetadata() {
  return cmsPageMetadata("Detalle de tarea");
}

export default async function CmsTaskPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<TaskSearchParams>;
}) {
  const actor = await requireCmsMember("/cms/tasks");
  const { id } = await params;
  if (!taskIdentifierSchema.safeParse(id).success) notFound();
  const task = await cmsTaskService.get(actor, id).catch((error: unknown) => {
    if (error instanceof CmsNotFoundError) notFound();
    throw error;
  });
  return (
    <CmsShell actor={actor}>
      {/* Keyed by task, so moving between tasks never carries one's unsaved
          edits into the next. */}
      <TaskDetail
        key={task.id}
        task={task}
        from={taskOrigin(await searchParams)}
        now={new Date().toISOString()}
      />
    </CmsShell>
  );
}

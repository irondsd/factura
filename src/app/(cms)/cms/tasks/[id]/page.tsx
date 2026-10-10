import { notFound } from "next/navigation";
import { requireCmsMember } from "@/cms/auth/requireCmsMember";
import { CmsPageHeader } from "@/cms/components/CmsPageHeader";
import { CmsShell } from "@/cms/components/CmsShell";
import { cmsPageMetadata } from "@/cms/metadata";
import { CmsNotFoundError } from "@/cms/server/errors";
import { TaskDetail } from "@/cms/tasks/components/TaskDetail";
import { taskIdentifierSchema } from "@/cms/tasks/inputs";
import { cmsTaskService } from "@/cms/tasks/server/service";

export const dynamic = "force-dynamic";
export function generateMetadata() {
  return cmsPageMetadata("Detalle de tarea");
}

export default async function CmsTaskPage({
  params,
}: {
  params: Promise<{ id: string }>;
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
      <CmsPageHeader
        back={{ href: "/cms/tasks", label: "Tareas" }}
        eyebrow={task.reference}
        title={task.title}
      />
      <TaskDetail task={task} />
    </CmsShell>
  );
}

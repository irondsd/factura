import Link from "next/link";
import { requireCmsMember } from "@/cms/auth/requireCmsMember";
import { CmsPageHeader } from "@/cms/components/CmsPageHeader";
import { CmsShell } from "@/cms/components/CmsShell";
import { cmsPageMetadata } from "@/cms/metadata";
import { TaskArchive } from "@/cms/tasks/components/TaskArchive";
import {
  TaskFilters,
  TaskPagination,
} from "@/cms/tasks/components/TaskFilters";
import { taskFilters, type TaskSearchParams } from "@/cms/tasks/query";
import { cmsTaskService } from "@/cms/tasks/server/service";
import styles from "@/cms/tasks/components/Tasks.module.css";

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
  const dismissed = params.view === "dismissed";
  const result = await cmsTaskService.list(actor, {
    view: dismissed ? "dismissed" : "archive",
    search: filters.search,
    tags: filters.tag ? [filters.tag] : undefined,
    limit: 50,
    offset: (filters.page - 1) * 50,
  });
  return (
    <CmsShell actor={actor}>
      <CmsPageHeader
        back={{ href: "/cms/tasks", label: "Tareas" }}
        eyebrow="Trabajo compartido"
        title="Archivo"
      >
        Tareas completadas hace más de 7 días y tareas descartadas. Siempre
        puedes recuperarlas.
      </CmsPageHeader>
      <nav className={styles.archiveTabs} aria-label="Tipo de archivo">
        <Link
          className={styles.archiveLink}
          href="/cms/tasks/archive"
          aria-current={!dismissed ? "page" : undefined}
        >
          Completadas
        </Link>
        <Link
          className={styles.archiveLink}
          href="/cms/tasks/archive?view=dismissed"
          aria-current={dismissed ? "page" : undefined}
        >
          Descartadas
        </Link>
      </nav>
      <TaskFilters
        path="/cms/tasks/archive"
        {...filters}
        dismissed={dismissed}
      />
      <TaskArchive tasks={result.tasks} dismissed={dismissed} />
      <TaskPagination
        path="/cms/tasks/archive"
        {...filters}
        dismissed={dismissed}
        total={result.total}
        pageSize={50}
      />
    </CmsShell>
  );
}

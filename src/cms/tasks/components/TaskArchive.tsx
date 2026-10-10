"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui";
import { cn } from "@/lib/cn";
import { matchesTask, shortDate } from "../display";
import { taskHref } from "../query";
import { moveTaskAction } from "../server/actions";
import type { CmsTaskSummary, TaskTag } from "../types";
import {
  TaskHeading,
  TaskTagList,
  TaskToolbar,
  useTaskFilters,
} from "./TaskControls";
import { useTaskToast } from "./TaskToast";

type Tab = "done" | "dismissed";

const COLUMNS =
  "grid grid-cols-[64px_minmax(0,1fr)_auto] gap-4 md:grid-cols-[72px_minmax(0,1fr)_180px_90px_130px]";
const ROW_RULE = "border-t border-[color-mix(in_srgb,var(--line)_60%,transparent)]";

/** Dismissed tasks have no dismissal timestamp of their own; the last update
 * is the dismissal unless someone edited the task afterwards. */
const archivedAt = (task: CmsTaskSummary) => task.completedAt ?? task.updatedAt;

export function TaskArchive({
  done: initialDone,
  dismissed: initialDismissed,
  initialTab,
  initialSearch,
  initialTag,
}: {
  done: CmsTaskSummary[];
  dismissed: CmsTaskSummary[];
  initialTab: Tab;
  initialSearch: string;
  initialTag?: TaskTag;
}) {
  const router = useRouter();
  const toast = useTaskToast();
  const [tab, setTab] = useState<Tab>(initialTab);
  const filters = useTaskFilters(
    { search: initialSearch, tag: initialTag },
    { view: tab === "dismissed" ? "dismissed" : null },
  );
  const [lists, setLists] = useState({
    done: initialDone,
    dismissed: initialDismissed,
  });
  const [synced, setSynced] = useState({ initialDone, initialDismissed });
  if (
    synced.initialDone !== initialDone ||
    synced.initialDismissed !== initialDismissed
  ) {
    setSynced({ initialDone, initialDismissed });
    setLists({ done: initialDone, dismissed: initialDismissed });
  }

  const rows = lists[tab]
    .filter((task) => matchesTask(task, filters.search, filters.tag))
    .sort((a, b) => Date.parse(archivedAt(b)) - Date.parse(archivedAt(a)));

  function restore(task: CmsTaskSummary) {
    const previous = lists;
    setLists((current) => ({
      done: current.done.filter((item) => item.id !== task.id),
      dismissed: current.dismissed.filter((item) => item.id !== task.id),
    }));
    toast(`${task.reference} vuelve a Backlog`);
    void (async () => {
      try {
        const result = await moveTaskAction({ id: task.id, status: "backlog" });
        if (!result.ok) {
          setLists(previous);
          toast(result.message, "error");
        }
      } catch {
        setLists(previous);
        toast("No se pudo restaurar la tarea. Intenta de nuevo.", "error");
      } finally {
        router.refresh();
      }
    })();
  }

  const emptyText = filters.filtering
    ? "Nada coincide con la búsqueda."
    : tab === "done"
      ? "Nada completado hace más de 7 días."
      : "No hay tareas descartadas.";

  return (
    <div className="mx-auto flex max-w-[60rem] flex-col gap-7">
      <TaskHeading
        back={{ href: "/cms/tasks", label: "Tareas" }}
        eyebrow="Trabajo compartido"
        title="Archivo"
      >
        Tareas completadas hace más de 7 días y tareas descartadas. Siempre
        puedes recuperarlas.
      </TaskHeading>

      <div className="flex flex-col">
        <div className="-ml-3 flex gap-1" role="group" aria-label="Tipo de archivo">
          <TabPill active={tab === "done"} onClick={() => setTab("done")}>
            Completadas · {lists.done.length}
          </TabPill>
          <TabPill
            active={tab === "dismissed"}
            onClick={() => setTab("dismissed")}
          >
            Descartadas · {lists.dismissed.length}
          </TabPill>
        </div>
        <div className="mt-3">
          <TaskToolbar
            search={filters.search}
            onSearch={filters.setSearch}
            tag={filters.tag}
            onTag={filters.setTag}
          />
        </div>
      </div>

      <div className="flex flex-col">
        <div className={cn(COLUMNS, "pb-2.5")}>
          <span className="fd-th p-0">ID</span>
          <span className="fd-th p-0">Tarea</span>
          <span className="fd-th hidden p-0 md:block">Etiquetas</span>
          <span className="fd-th hidden p-0 md:block">
            {tab === "done" ? "Completada" : "Descartada"}
          </span>
          <span className="fd-th p-0" />
        </div>
        {rows.map((task) => (
          <div
            key={task.id}
            className={cn(
              COLUMNS,
              ROW_RULE,
              "relative items-center py-3 text-[13px] transition-colors hover:bg-[color-mix(in_srgb,var(--card)_70%,transparent)] has-[a:focus-visible]:bg-[color-mix(in_srgb,var(--card)_70%,transparent)]",
            )}
          >
            <span className="text-[11px] tracking-[0.08em] text-muted">
              {task.reference}
            </span>
            <Link
              href={taskHref(task.reference, tab === "done" ? "archive" : "dismissed")}
              className="truncate font-medium text-ink no-underline after:absolute after:inset-0 focus-visible:outline-none"
            >
              {task.title}
            </Link>
            <div className="hidden md:block">
              <TaskTagList tags={task.tags} />
            </div>
            <span className="hidden text-xs text-muted md:block">
              {shortDate(archivedAt(task))}
            </span>
            <div className="relative z-10 flex justify-end">
              <Button variant="outline" size="sm" onClick={() => restore(task)}>
                A Backlog
              </Button>
            </div>
          </div>
        ))}
        {!rows.length && (
          <p
            className={cn(
              ROW_RULE,
              "m-0 py-10 text-center text-[13px] text-muted",
            )}
          >
            {emptyText}
          </p>
        )}
        <div className={ROW_RULE} />
      </div>
    </div>
  );
}

/** The design system's text tab: accent with a dotted underline when on. */
function TabPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "cursor-pointer border-none bg-transparent px-3 py-1 font-mono text-micro uppercase tracking-label transition-colors",
        active
          ? "text-accent underline decoration-dotted underline-offset-8"
          : "text-muted hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}

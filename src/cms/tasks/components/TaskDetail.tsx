"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Button, Field, Input, Select } from "@/components/ui";
import { cn } from "@/lib/cn";
import { isArchived, relativeAge, shortDate } from "../display";
import { hasPendingUpload } from "../images";
import type { TaskOrigin } from "../query";
import { moveTaskAction, updateTaskAction } from "../server/actions";
import type { CmsTask, TaskStatus, TaskTag } from "../types";
import {
  BOARD_STATUSES,
  DescriptionEditor,
  STATUS_LABELS,
  TagPicker,
  TaskHeading,
} from "./TaskControls";
import { useTaskToast } from "./TaskToast";

const BACK: Record<TaskOrigin, { href: string; label: string }> = {
  board: { href: "/cms/tasks", label: "Tareas" },
  archive: { href: "/cms/tasks/archive", label: "Archivo" },
  dismissed: { href: "/cms/tasks/archive?view=dismissed", label: "Archivo" },
};

const sameTags = (a: TaskTag[], b: TaskTag[]) =>
  [...a].sort().join() === [...b].sort().join();

export function TaskDetail({
  task: initial,
  from,
  now,
}: {
  task: CmsTask;
  from: TaskOrigin;
  now: string;
}) {
  const router = useRouter();
  const toast = useTaskToast();
  const [task, setTask] = useState(initial);
  const [title, setTitle] = useState(initial.title);
  const [description, setDescription] = useState(initial.description);
  const [tags, setTags] = useState(initial.tags);
  const [busy, setBusy] = useState(false);
  const dirty =
    title !== task.title ||
    description !== task.description ||
    !sameTags(tags, task.tags);
  const archived = isArchived(task, now);
  const uploading = hasPendingUpload(description);

  async function move(
    status: TaskStatus,
    message: string,
    kind: "ok" | "warn" = "ok",
  ): Promise<boolean> {
    const previous = task;
    setTask({
      ...task,
      status,
      completedAt:
        status === "done"
          ? task.status === "done"
            ? task.completedAt
            : new Date().toISOString()
          : null,
    });
    setBusy(true);
    try {
      const result = await moveTaskAction({ id: task.id, status });
      if (!result.ok) {
        setTask(previous);
        toast(result.message, "error");
        return false;
      }
      // Status only: unsaved edits in the form stay as they are.
      setTask(result.data);
      toast(message, kind);
      router.refresh();
      return true;
    } catch {
      setTask(previous);
      toast("No se pudo cambiar el estado. Intenta de nuevo.", "error");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    // Send only edited fields. A status update from an agent never needs to
    // overwrite the brief, and neither does an unchanged form field.
    const patch = {
      ...(title !== task.title ? { title } : {}),
      ...(description !== task.description ? { description } : {}),
      ...(!sameTags(tags, task.tags) ? { tags } : {}),
    };
    setBusy(true);
    try {
      const result = await updateTaskAction({ id: task.id, patch });
      if (!result.ok) {
        toast(result.message, "error");
        return;
      }
      setTask(result.data);
      setTitle(result.data.title);
      setDescription(result.data.description);
      setTags(result.data.tags);
      toast(`Cambios guardados · ${result.data.reference}`);
      router.refresh();
    } catch {
      toast("No se pudieron guardar los cambios. Intenta de nuevo.", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-[60rem] flex-col gap-7">
      <TaskHeading
        back={BACK[from]}
        eyebrow={task.reference}
        title={title.trim() || "Sin título"}
      />

      <div className="grid grid-cols-1 items-start gap-8 md:grid-cols-[minmax(0,1fr)_260px] md:gap-10">
        <form
          className="flex flex-col gap-6"
          onSubmit={(event) => {
            event.preventDefault();
            if (dirty && title.trim() && !busy && !uploading) void save();
          }}
        >
          <Field label="Título">
            <Input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={180}
              disabled={busy}
              className="bg-card! py-2.5! text-[15px]!"
            />
          </Field>
          <DescriptionEditor
            value={description}
            onChange={setDescription}
            disabled={busy}
          />
          <TagPicker value={tags} onChange={setTags} disabled={busy} />
          <div className="flex flex-wrap items-center gap-3 border-t border-line pt-5">
            <Button
              type="submit"
              variant="solid"
              size="lg"
              disabled={busy || uploading || !dirty || !title.trim()}
            >
              {uploading ? "Subiendo imagen…" : "Guardar cambios"}
            </Button>
            {dirty && (
              <Button
                type="button"
                variant="ghost"
                size="lg"
                disabled={busy}
                onClick={() => {
                  setTitle(task.title);
                  setDescription(task.description);
                  setTags(task.tags);
                }}
              >
                Deshacer
              </Button>
            )}
            <span
              role="status"
              className={cn("text-xs", dirty ? "text-accent" : "text-muted")}
            >
              {dirty ? "△ cambios sin guardar" : "Sin cambios"}
            </span>
          </div>
        </form>

        <aside
          aria-label="Estado de la tarea"
          className="receipt-edge row-start-1 flex flex-col gap-[18px] border border-line bg-card px-5 pt-5 pb-8 md:sticky md:top-24 md:row-start-auto"
        >
          {archived ? (
            <div className="flex flex-col gap-[5px]">
              <span className="font-mono text-[10px] tracking-[0.14em] text-muted uppercase">
                Estado
              </span>
              <span className="text-sm">{STATUS_LABELS[task.status]}</span>
            </div>
          ) : (
            <Field label="Estado">
              <Select
                value={task.status}
                disabled={busy}
                onChange={(event) => {
                  const status = event.target.value as TaskStatus;
                  void move(
                    status,
                    `${task.reference} → ${STATUS_LABELS[status]}`,
                  );
                }}
                className="w-full"
              >
                {BOARD_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {STATUS_LABELS[status]}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <dl className="m-0 flex flex-col">
            <Meta label="Creada">{shortDate(task.createdAt)}</Meta>
            <Meta label="Actualizada">
              <span suppressHydrationWarning>
                {relativeAge(task.updatedAt, now)}
              </span>
            </Meta>
            {task.completedAt && (
              <Meta label="Completada">{shortDate(task.completedAt)}</Meta>
            )}
          </dl>
          {archived ? (
            <Button
              variant="outline"
              size="lg"
              disabled={busy}
              className="w-full"
              onClick={() =>
                void move("backlog", `${task.reference} vuelve a Backlog`)
              }
            >
              Volver a Backlog
            </Button>
          ) : (
            <Button
              variant="outline"
              size="lg"
              disabled={busy}
              className="w-full"
              onClick={async () => {
                const ok = await move(
                  "dismissed",
                  `${task.reference} descartada · está en el archivo`,
                  "warn",
                );
                if (ok) router.push("/cms/tasks");
              }}
            >
              ✕ Descartar tarea
            </Button>
          )}
        </aside>
      </div>
    </div>
  );
}

function Meta({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between border-t border-[color-mix(in_srgb,var(--line)_60%,transparent)] py-[9px] text-xs last:border-b">
      <dt className="text-muted">{label}</dt>
      <dd className="m-0">{children}</dd>
    </div>
  );
}

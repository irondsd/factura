"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type DragEvent } from "react";
import { createPortal } from "react-dom";
import { Button, Field, Input } from "@/components/ui";
import { cn } from "@/lib/cn";
import { useModalChrome } from "@/cms/components/CmsDialog";
import { descriptionPreview } from "../descriptionPreview";
import { COLUMN_RULE, matchesTask, relativeAge } from "../display";
import { hasPendingUpload } from "../images";
import { taskHref } from "../query";
import { createTaskAction, moveTaskAction } from "../server/actions";
import type { CmsTaskSummary, TaskStatus, TaskTag } from "../types";
import {
  BOARD_STATUSES,
  DescriptionEditor,
  STATUS_LABELS,
  TagPicker,
  TaskHeading,
  TaskTagList,
  TaskToolbar,
  useTaskFilters,
} from "./TaskControls";
import { useTaskToast } from "./TaskToast";

const DRAG_TYPE = "application/x-factura-task";

/** The board after a move, as the server will order it: a card dropped on
 * another goes in front of it, a card dropped on a column goes to its end, and
 * a newly done card goes on top because done sorts by completion time. */
function reordered(
  list: CmsTaskSummary[],
  id: string,
  status: TaskStatus,
  beforeId: string | null | undefined,
  now: string,
): CmsTaskSummary[] {
  const task = list.find((item) => item.id === id);
  if (!task) return list;
  const statusChanged = task.status !== status;
  if (!statusChanged && (beforeId === undefined || status === "done"))
    return list;
  const moved: CmsTaskSummary = {
    ...task,
    status,
    updatedAt: now,
    completedAt:
      status === "done" ? (statusChanged ? now : task.completedAt) : null,
  };
  const rest = list.filter((item) => item.id !== id);
  let index =
    status === "done"
      ? rest.findIndex((item) => item.status === "done")
      : beforeId
        ? rest.findIndex((item) => item.id === beforeId)
        : -1;
  if (index < 0) index = rest.length;
  rest.splice(index, 0, moved);
  return rest;
}

export function TaskBoard({
  tasks,
  archiveCount,
  nextNumber: serverNextNumber,
  now,
  initialSearch,
  initialTag,
}: {
  tasks: CmsTaskSummary[];
  archiveCount: number;
  nextNumber: number;
  now: string;
  initialSearch: string;
  initialTag?: TaskTag;
}) {
  const router = useRouter();
  const toast = useTaskToast();
  const filters = useTaskFilters({ search: initialSearch, tag: initialTag });
  const [items, setItems] = useState(tasks);
  const [synced, setSynced] = useState(tasks);
  const [pending, setPending] = useState(0);
  const [creating, setCreating] = useState(false);
  const [nextNumber, setNextNumber] = useState(serverNextNumber);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overColumn, setOverColumn] = useState<TaskStatus | null>(null);
  const [overCard, setOverCard] = useState<string | null>(null);

  // Take the server's board whenever a refresh brings one, unless a move is
  // still in flight — its optimistic position would flicker back and forth.
  // A board held back here is picked up once the last move settles.
  if (tasks !== synced && pending === 0) {
    setSynced(tasks);
    setItems(tasks);
    setNextNumber((current) => Math.max(current, serverNextNumber));
  }

  // Refresh on returning to the board, and while it remains open: agent moves
  // and the seven-day archive window do not depend on a browser mutation.
  const idle = pending === 0 && !creating && dragId === null;
  const idleRef = useRef(idle);
  useEffect(() => {
    idleRef.current = idle;
  }, [idle]);
  useEffect(() => {
    const refresh = () => {
      if (!document.hidden && idleRef.current) router.refresh();
    };
    const timer = window.setInterval(refresh, 60_000);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [router]);

  function clearDrag() {
    setDragId(null);
    setOverColumn(null);
    setOverCard(null);
  }

  function move(id: string, status: TaskStatus, beforeId?: string | null) {
    clearDrag();
    const task = items.find((item) => item.id === id);
    if (!task) return;
    const next = reordered(items, id, status, beforeId, new Date().toISOString());
    if (next === items) return;
    const previous = items;
    setItems(next);
    if (task.status !== status)
      toast(`${task.reference} → ${STATUS_LABELS[status]}`);
    setPending((count) => count + 1);
    void (async () => {
      try {
        const result = await moveTaskAction({
          id,
          status,
          ...(beforeId !== undefined ? { beforeId } : {}),
        });
        if (!result.ok) {
          setItems(previous);
          toast(result.message, "error");
        }
      } catch {
        setItems(previous);
        toast("No se pudo mover la tarea. Intenta de nuevo.", "error");
      } finally {
        setPending((count) => count - 1);
        router.refresh();
      }
    })();
  }

  function draggedId(event: DragEvent): string | null {
    return event.dataTransfer.getData(DRAG_TYPE) || dragId;
  }

  const shown = items.filter((task) =>
    matchesTask(task, filters.search, filters.tag),
  );

  return (
    <div className="flex flex-col gap-7">
      <TaskHeading
        eyebrow="Trabajo compartido"
        title="Tareas"
        actions={
          <>
            <Button variant="outline" size="lg" href="/cms/tasks/archive">
              Archivo · {archiveCount}
            </Button>
            <Button variant="solid" size="lg" onClick={() => setCreating(true)}>
              + Nueva tarea
            </Button>
          </>
        }
      >
        Organiza lo que sigue. Arrastra las tarjetas o cambia su estado.
      </TaskHeading>

      <TaskToolbar
        search={filters.search}
        onSearch={filters.setSearch}
        tag={filters.tag}
        onTag={filters.setTag}
      >
        {filters.filtering && (
          <span className="text-xs text-muted">
            {shown.length} de {items.length} ·{" "}
            <button
              type="button"
              onClick={filters.clear}
              className="cursor-pointer border-none bg-transparent p-0 font-mono text-xs text-accent underline decoration-dotted underline-offset-4 hover:text-ink"
            >
              limpiar
            </button>
          </span>
        )}
      </TaskToolbar>

      <div
        className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] items-start gap-4"
        aria-busy={pending > 0}
      >
        {BOARD_STATUSES.map((status, columnIndex) => {
          const cards = shown.filter((task) => task.status === status);
          const over = dragId !== null && overColumn === status;
          const previousStatus = BOARD_STATUSES[columnIndex - 1];
          const nextStatus = BOARD_STATUSES[columnIndex + 1];
          return (
            <section
              key={status}
              aria-labelledby={`column-${status}`}
              className="flex min-w-0 flex-col"
              onDragOver={(event) => {
                if (!dragId) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                if (overColumn !== status || overCard !== null) {
                  setOverColumn(status);
                  setOverCard(null);
                }
              }}
              onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node))
                  setOverColumn(null);
              }}
              onDrop={(event) => {
                event.preventDefault();
                const id = draggedId(event);
                if (id) move(id, status, status === "done" ? undefined : null);
                else clearDrag();
              }}
            >
              <div
                className={cn(
                  "flex items-baseline justify-between border-t-2 px-0.5 pt-2.5 pb-3",
                  COLUMN_RULE[status],
                )}
              >
                <h2 id={`column-${status}`} className="fd-label m-0 text-ink">
                  {STATUS_LABELS[status]}
                </h2>
                <span
                  className="text-xs text-muted tabular-nums"
                  aria-label={`${cards.length} tareas`}
                >
                  {cards.length}
                </span>
              </div>
              <div
                className={cn(
                  "-m-1.5 flex min-h-[140px] flex-col gap-2 border border-dashed p-1.5 transition-colors",
                  over
                    ? "border-accent bg-[var(--accent-soft)]"
                    : "border-transparent bg-transparent",
                )}
              >
                {cards.map((task) => (
                  <article
                    key={task.id}
                    draggable
                    onDragStart={(event) => {
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData(DRAG_TYPE, task.id);
                      // Next frame, so the drag image is the card at full
                      // strength rather than its faded placeholder.
                      window.setTimeout(() => setDragId(task.id), 0);
                    }}
                    onDragEnd={clearDrag}
                    onDragOver={(event) => {
                      if (!dragId) return;
                      event.preventDefault();
                      event.stopPropagation();
                      event.dataTransfer.dropEffect = "move";
                      if (overCard !== task.id || overColumn !== status) {
                        setOverCard(task.id);
                        setOverColumn(status);
                      }
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      const id = draggedId(event);
                      if (id && id !== task.id)
                        move(id, status, status === "done" ? undefined : task.id);
                      else clearDrag();
                    }}
                    className={cn(
                      "relative flex cursor-grab flex-col gap-2 border border-line bg-card px-3.5 py-3 transition-[border-color,opacity] hover:border-ink active:cursor-grabbing has-[a:focus-visible]:border-accent",
                      dragId === task.id && "opacity-40",
                      overCard === task.id &&
                        dragId !== task.id &&
                        status !== "done" &&
                        "shadow-[0_-3px_0_0_var(--accent)]",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="fd-label text-[10px]">
                        {task.reference}
                      </span>
                      <span
                        className="text-[11px] text-muted"
                        suppressHydrationWarning
                      >
                        {relativeAge(
                          status === "done" && task.completedAt
                            ? task.completedAt
                            : task.updatedAt,
                          now,
                        )}
                      </span>
                    </div>
                    {/* The title is the card's link, stretched over the whole
                        card so a click anywhere opens it. Not draggable itself,
                        so a drag that starts on it picks up the card. */}
                    <Link
                      href={taskHref(task.reference)}
                      draggable={false}
                      className="text-[14px] leading-[1.4] font-medium text-pretty text-ink no-underline [overflow-wrap:anywhere] after:absolute after:inset-0 focus-visible:outline-none"
                    >
                      {task.title}
                    </Link>
                    {task.descriptionPreview && (
                      <p className="m-0 line-clamp-2 text-xs leading-[1.55] text-muted [overflow-wrap:anywhere]">
                        {task.descriptionPreview}
                      </p>
                    )}
                    <div className="flex items-center justify-between gap-2 pt-0.5">
                      <TaskTagList tags={task.tags} />
                      <div className="relative z-10 -mr-1.5 ml-auto flex gap-0.5">
                        {previousStatus && (
                          <MoveButton
                            label={`Mover a ${STATUS_LABELS[previousStatus]}`}
                            onClick={() => move(task.id, previousStatus)}
                          >
                            ‹
                          </MoveButton>
                        )}
                        {nextStatus && (
                          <MoveButton
                            label={`Mover a ${STATUS_LABELS[nextStatus]}`}
                            onClick={() => move(task.id, nextStatus)}
                          >
                            ›
                          </MoveButton>
                        )}
                      </div>
                    </div>
                  </article>
                ))}
                {!cards.length && (
                  <p className="m-0 grid min-h-[110px] flex-1 place-items-center border border-dashed border-line p-3 text-center text-xs text-muted">
                    {filters.filtering
                      ? "Nada coincide."
                      : over
                        ? "Suelta aquí"
                        : "Sin tareas."}
                  </p>
                )}
              </div>
              {status === "done" && (
                <p className="mx-0.5 mt-3.5 mb-0 text-[11px] leading-[1.6] text-muted">
                  Últimos 7 días. Las anteriores están en el{" "}
                  <Link
                    href="/cms/tasks/archive"
                    className="text-accent underline decoration-dotted underline-offset-4 hover:text-ink"
                  >
                    archivo
                  </Link>
                  .
                </p>
              )}
            </section>
          );
        })}
      </div>

      {creating && (
        <NewTaskDialog
          nextNumber={nextNumber}
          onClose={() => setCreating(false)}
          onCreated={(task) => {
            setCreating(false);
            setNextNumber(task.number + 1);
            setItems((list) => {
              const index = list.findIndex((item) => item.status === "backlog");
              const next = [...list];
              next.splice(index < 0 ? 0 : index, 0, task);
              return next;
            });
            toast(`${task.reference} creada · en Backlog`);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function MoveButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className="size-6 cursor-pointer border-none bg-transparent font-mono text-[15px] leading-none text-muted transition-colors hover:text-accent focus-visible:text-accent focus-visible:outline-none"
    >
      {children}
    </button>
  );
}

function NewTaskDialog({
  nextNumber,
  onClose,
  onCreated,
}: {
  nextNumber: number;
  onClose: () => void;
  onCreated: (task: CmsTaskSummary) => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState<TaskTag[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const panel = useModalChrome({ busy, onClose });
  const titleField = useRef<HTMLInputElement>(null);
  const uploading = hasPendingUpload(description);
  const canCreate = Boolean(title.trim()) && !busy && !uploading;

  // After `useModalChrome` has moved focus to the first control (the ✕).
  useEffect(() => titleField.current?.focus(), []);

  // ⌘↵ from anywhere while the dialog is open — focus can be on the page body
  // once the preview has replaced the textarea it was in.
  const createRef = useRef(create);
  useEffect(() => {
    createRef.current = create;
  });
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Enter" || !(event.metaKey || event.ctrlKey)) return;
      event.preventDefault();
      void createRef.current();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  async function create() {
    if (!canCreate) return;
    setBusy(true);
    setError("");
    try {
      const result = await createTaskAction({ title, description, tags });
      if (!result.ok) {
        setError(result.message);
        setBusy(false);
        return;
      }
      const { description: full, ...task } = result.data;
      onCreated({ ...task, descriptionPreview: descriptionPreview(full) });
    } catch {
      setError("No se pudo crear la tarea. Intenta de nuevo.");
      setBusy(false);
    }
  }

  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      onClick={() => !busy && onClose()}
      className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-[color-mix(in_srgb,var(--ink)_30%,transparent)] px-4 py-[8vh] animate-[fd-fade-in_.15s_ease-out] sm:px-5"
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-task-title"
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        className="receipt-edge box-border flex w-full max-w-[640px] flex-col gap-[22px] border border-line bg-card px-5 pt-6 pb-11 shadow-receipt outline-none sm:px-7 sm:pt-7"
      >
        <div className="flex items-start justify-between">
          <div className="flex flex-col gap-1.5">
            <span className="fd-label">TASK-{nextNumber} · Backlog</span>
            <h2
              id="new-task-title"
              className="m-0 font-display text-2xl font-semibold tracking-[-0.01em]"
            >
              Nueva tarea
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            title="Cerrar"
            aria-label="Cerrar"
            className="cursor-pointer border-none bg-transparent p-1 font-mono text-sm text-muted transition-colors hover:text-ink"
          >
            ✕
          </button>
        </div>
        <form
          className="contents"
          onSubmit={(event) => {
            event.preventDefault();
            void create();
          }}
        >
          <Field label="Título">
            <Input
              ref={titleField}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Qué hay que hacer"
              maxLength={180}
              disabled={busy}
              className="py-2.5! text-[15px]!"
            />
          </Field>
          <DescriptionEditor
            id="new-task-description"
            compact
            value={description}
            onChange={setDescription}
            disabled={busy}
          />
          <TagPicker value={tags} onChange={setTags} disabled={busy} />
          {error && (
            <p className="m-0 text-xs text-accent" role="alert">
              ✕ {error}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2 pt-1.5">
            <Button type="submit" variant="solid" size="lg" disabled={!canCreate}>
              {busy
                ? "Creando…"
                : uploading
                  ? "Subiendo imagen…"
                  : "Crear tarea"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="lg"
              disabled={busy}
              onClick={onClose}
            >
              Cancelar
            </Button>
            <div className="flex-1" />
            <span className="hidden text-[11px] text-muted sm:inline">
              ⌘↵ crear · Esc cerrar
            </span>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}

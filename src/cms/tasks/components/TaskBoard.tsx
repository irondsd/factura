"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useRef,
  useState,
  useTransition,
  type DragEvent,
} from "react";
import { CmsDialog } from "@/cms/components/CmsDialog";
import { CmsIcon } from "@/cms/icons";
import { createTaskAction, moveTaskAction } from "../server/actions";
import type { CmsTaskSummary, TaskStatus, TaskTag } from "../types";
import {
  BOARD_STATUSES,
  DescriptionEditor,
  STATUS_LABELS,
  TagPicker,
  TaskTags,
} from "./TaskControls";
import styles from "./Tasks.module.css";

export function TaskBoard({
  tasks,
  canReorder = true,
}: {
  tasks: CmsTaskSummary[];
  canReorder?: boolean;
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, startTransition] = useTransition();
  const dragged = useRef(false);

  // Refresh on returning to the board, and while it remains open: agent moves
  // and the seven-day archive window do not depend on a browser mutation.
  useEffect(() => {
    const refresh = () => {
      if (!document.hidden) router.refresh();
    };
    const timer = window.setInterval(refresh, 60_000);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [router]);

  function move(id: string, status: TaskStatus, beforeId?: string | null) {
    setError("");
    setMessage("");
    startTransition(async () => {
      try {
        const result = await moveTaskAction({
          id,
          status,
          ...(beforeId !== undefined ? { beforeId } : {}),
        });
        if (!result.ok) {
          setError(result.message);
          return;
        }
        setMessage(
          `${result.data.reference}: ${STATUS_LABELS[result.data.status]}.`,
        );
        router.refresh();
      } catch {
        setError("No se pudo mover la tarea. Intenta de nuevo.");
      }
    });
  }

  function drop(event: DragEvent, status: TaskStatus, beforeId?: string) {
    event.preventDefault();
    event.stopPropagation();
    const id = event.dataTransfer.getData("application/x-factura-task");
    setDragging(null);
    setOver(null);
    const task = tasks.find((item) => item.id === id);
    if (
      busy ||
      !id ||
      id === beforeId ||
      !task ||
      (!canReorder && task.status === status)
    )
      return;
    move(
      id,
      status,
      status === "done" ? undefined : canReorder ? (beforeId ?? null) : null,
    );
  }

  return (
    <>
      <div className={styles.actions}>
        <button className={styles.primary} onClick={() => setCreating(true)}>
          <CmsIcon name="add" size="sm" />
          Nueva tarea
        </button>
        <Link className={styles.button} href="/cms/tasks/archive">
          <CmsIcon name="history" size="sm" />
          Archivo
        </Link>
      </div>
      {!canReorder && (
        <p className={styles.hint}>
          Puedes cambiar estados. Para ordenar tarjetas, quita los filtros y
          muestra el tablero completo.
        </p>
      )}
      {(busy || message) && (
        <p className={styles.hint} role="status">
          {busy ? "Moviendo tarea…" : message}
        </p>
      )}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <div className={`${styles.board} mt-6`} aria-busy={busy}>
        {BOARD_STATUSES.map((status) => {
          const column = tasks.filter((task) => task.status === status);
          return (
            <section
              key={status}
              className={styles.column}
              data-status={status}
              data-over={over === status}
              aria-labelledby={`column-${status}`}
              onDragOver={(event) => {
                if (dragging && !busy) {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                  setOver(status);
                }
              }}
              onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node))
                  setOver(null);
              }}
              onDrop={(event) => drop(event, status)}
            >
              <div className={styles.columnHeading}>
                <h2 id={`column-${status}`}>{STATUS_LABELS[status]}</h2>
                <span
                  className={styles.count}
                  aria-label={`${column.length} tareas`}
                >
                  {column.length}
                </span>
              </div>
              <div className={styles.cards}>
                {column.map((task) => (
                  <Link
                    key={task.id}
                    className={styles.card}
                    href={`/cms/tasks/${task.reference}`}
                    aria-label={`${task.reference}: ${task.title}`}
                    draggable={!busy}
                    data-dragging={dragging === task.id}
                    data-over={over === task.id}
                    onPointerDown={() => {
                      // Keep the drag guard through dragend and any following
                      // click; only a fresh pointer gesture should reset it.
                      dragged.current = false;
                    }}
                    onClick={(event) => {
                      if (busy || (event.detail !== 0 && dragged.current))
                        event.preventDefault();
                    }}
                    onDragStart={(event) => {
                      dragged.current = true;
                      event.dataTransfer.clearData();
                      event.dataTransfer.setData(
                        "application/x-factura-task",
                        task.id,
                      );
                      event.dataTransfer.effectAllowed = "move";
                      setDragging(task.id);
                    }}
                    onDragEnd={() => {
                      setDragging(null);
                      setOver(null);
                    }}
                    onDragOver={(event) => {
                      if (
                        dragging &&
                        !busy &&
                        canReorder &&
                        status !== "done"
                      ) {
                        event.preventDefault();
                        event.stopPropagation();
                        setOver(task.id);
                      }
                    }}
                    onDrop={(event) =>
                      drop(
                        event,
                        status,
                        status === "done" ? undefined : task.id,
                      )
                    }
                  >
                    <p className={styles.reference}>{task.reference}</p>
                    <span className={styles.cardTitle}>{task.title}</span>
                    {task.descriptionPreview && (
                      <p className={styles.cardDescription}>
                        {task.descriptionPreview}
                      </p>
                    )}
                    <TaskTags tags={task.tags} />
                  </Link>
                ))}
                {!column.length && (
                  <p className={styles.empty}>
                    {status === "backlog"
                      ? "Las nuevas tareas empiezan aquí."
                      : "Sin tareas."}
                  </p>
                )}
              </div>
              {status === "done" && (
                <p className={styles.columnHint}>
                  Últimos 7 días. Las anteriores están en el archivo.
                </p>
              )}
            </section>
          );
        })}
      </div>
      {creating && (
        <NewTaskDialog
          onClose={() => setCreating(false)}
          onCreated={(reference) => {
            setCreating(false);
            setMessage(`${reference} creada en Backlog.`);
            router.refresh();
          }}
        />
      )}
    </>
  );
}

function NewTaskDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (reference: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState<TaskTag[]>([]);
  const [error, setError] = useState("");
  const [busy, startTransition] = useTransition();
  return (
    <CmsDialog title="Nueva tarea" onClose={onClose} busy={busy} width="720px">
      <form
        className={styles.form}
        onSubmit={(event) => {
          event.preventDefault();
          setError("");
          startTransition(async () => {
            try {
              const result = await createTaskAction({
                title,
                description,
                tags,
              });
              if (!result.ok) {
                setError(result.message);
                return;
              }
              onCreated(result.data.reference);
            } catch {
              setError("No se pudo crear la tarea. Intenta de nuevo.");
            }
          });
        }}
      >
        <label className={styles.field}>
          Título
          <input
            className={styles.input}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            required
            maxLength={180}
            disabled={busy}
          />
        </label>
        <DescriptionEditor
          value={description}
          onChange={setDescription}
          disabled={busy}
        />
        <TagPicker value={tags} onChange={setTags} disabled={busy} />
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        <div className={styles.actions}>
          <button
            className={styles.primary}
            type="submit"
            disabled={busy || !title.trim()}
          >
            {busy ? "Creando…" : "Crear tarea"}
          </button>
          <button
            className={styles.button}
            type="button"
            disabled={busy}
            onClick={onClose}
          >
            Cancelar
          </button>
        </div>
      </form>
    </CmsDialog>
  );
}

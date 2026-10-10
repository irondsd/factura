"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CmsIcon } from "@/cms/icons";
import type { CmsTask, TaskStatus } from "../types";
import { moveTaskAction, updateTaskAction } from "../server/actions";
import { DescriptionEditor, STATUS_LABELS, TagPicker } from "./TaskControls";
import styles from "./Tasks.module.css";

export function TaskDetail({ task: initial }: { task: CmsTask }) {
  const router = useRouter();
  const [task, setTask] = useState(initial);
  const [title, setTitle] = useState(initial.title);
  const [description, setDescription] = useState(initial.description);
  const [tags, setTags] = useState(initial.tags);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, startTransition] = useTransition();
  const dirty =
    title !== task.title ||
    description !== task.description ||
    JSON.stringify(tags) !== JSON.stringify(task.tags);

  function move(status: TaskStatus) {
    setMessage("");
    setError("");
    startTransition(async () => {
      try {
        const result = await moveTaskAction({ id: task.id, status });
        if (!result.ok) {
          setError(result.message);
          return;
        }
        setTask(result.data);
        // Preserve an editor's unsaved text when only the task status changes.
        if (title === task.title) setTitle(result.data.title);
        if (description === task.description)
          setDescription(result.data.description);
        if (JSON.stringify(tags) === JSON.stringify(task.tags))
          setTags(result.data.tags);
        setMessage(`Estado: ${STATUS_LABELS[result.data.status]}.`);
        router.refresh();
      } catch {
        setError("No se pudo cambiar el estado. Intenta de nuevo.");
      }
    });
  }

  return (
    <>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className={styles.message} role="status">
          {message}
        </p>
      )}
      <div className={styles.detail}>
        <form
          className={styles.form}
          onSubmit={(event) => {
            event.preventDefault();
            setError("");
            setMessage("");
            // Send only edited fields. A status update from an agent never needs
            // to overwrite the brief, and neither does an unchanged form field.
            const patch = {
              ...(title !== task.title ? { title } : {}),
              ...(description !== task.description ? { description } : {}),
              ...(JSON.stringify(tags) !== JSON.stringify(task.tags)
                ? { tags }
                : {}),
            };
            startTransition(async () => {
              try {
                const result = await updateTaskAction({ id: task.id, patch });
                if (!result.ok) {
                  setError(result.message);
                  return;
                }
                setTask(result.data);
                setTitle(result.data.title);
                setDescription(result.data.description);
                setTags(result.data.tags);
                setMessage("Cambios guardados.");
                router.refresh();
              } catch {
                setError(
                  "No se pudieron guardar los cambios. Intenta de nuevo.",
                );
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
              maxLength={180}
              required
              disabled={busy}
            />
          </label>
          <DescriptionEditor
            value={description}
            onChange={setDescription}
            disabled={busy}
          />
          <TagPicker value={tags} onChange={setTags} disabled={busy} />
          <div className={styles.actions}>
            <button
              type="submit"
              className={styles.primary}
              disabled={busy || !dirty || !title.trim()}
            >
              <CmsIcon name="save" size="sm" />
              {busy ? "Guardando…" : "Guardar cambios"}
            </button>
            {dirty && <span className={styles.hint}>Cambios sin guardar</span>}
          </div>
        </form>
        <aside className={styles.sidebar} aria-label="Estado de la tarea">
          <label className={styles.field}>
            Estado
            <select
              className={styles.select}
              value={task.status}
              disabled={busy}
              onChange={(event) => move(event.target.value as TaskStatus)}
            >
              {Object.entries(STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          {task.completedAt && (
            <p>
              Completada el{" "}
              {new Intl.DateTimeFormat("es-AR", {
                dateStyle: "medium",
                timeZone: "America/Argentina/Buenos_Aires",
              }).format(new Date(task.completedAt))}
              . Después de 7 días aparece en el archivo.
            </p>
          )}
          {task.status === "dismissed" ? (
            <>
              <p>Esta tarea está descartada y conserva su referencia.</p>
              <button
                className={styles.button}
                type="button"
                disabled={busy}
                onClick={() => move("backlog")}
              >
                <CmsIcon name="restore" size="sm" />
                Volver a Backlog
              </button>
            </>
          ) : (
            <button
              className={styles.button}
              type="button"
              disabled={busy}
              onClick={() => move("dismissed")}
            >
              <CmsIcon name="close" size="sm" />
              Descartar tarea
            </button>
          )}
        </aside>
      </div>
    </>
  );
}

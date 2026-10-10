"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { CmsTaskSummary } from "../types";
import { moveTaskAction } from "../server/actions";
import { TaskTags } from "./TaskControls";
import styles from "./Tasks.module.css";

export function TaskArchive({
  tasks,
  dismissed,
}: {
  tasks: CmsTaskSummary[];
  dismissed: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, startTransition] = useTransition();
  return (
    <>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <p role="status" className="sr-only">
        {busy ? "Restaurando tarea…" : message}
      </p>
      {!tasks.length ? (
        <p className={styles.empty}>
          {dismissed
            ? "No hay tareas descartadas que coincidan."
            : "No hay tareas archivadas que coincidan."}
        </p>
      ) : (
        <ul className={styles.archiveList} aria-busy={busy}>
          {tasks.map((task) => (
            <li className={styles.archiveRow} key={task.id}>
              <div className={styles.archiveMain}>
                <p className={styles.reference}>{task.reference}</p>
                <Link
                  className={styles.cardTitle}
                  href={`/cms/tasks/${task.reference}`}
                >
                  {task.title}
                </Link>
                <TaskTags tags={task.tags} />
                {task.completedAt && (
                  <time
                    className={styles.archiveDate}
                    dateTime={task.completedAt}
                  >
                    Completada el{" "}
                    {new Intl.DateTimeFormat("es-AR", {
                      dateStyle: "medium",
                      timeZone: "America/Argentina/Buenos_Aires",
                    }).format(new Date(task.completedAt))}
                  </time>
                )}
              </div>
              <button
                className={styles.button}
                disabled={busy}
                onClick={() => {
                  setError("");
                  startTransition(async () => {
                    try {
                      const result = await moveTaskAction({
                        id: task.id,
                        status: "backlog",
                      });
                      if (!result.ok) {
                        setError(result.message);
                        return;
                      }
                      setMessage(`${task.reference} vuelve a Backlog.`);
                      router.refresh();
                    } catch {
                      setError(
                        "No se pudo restaurar la tarea. Intenta de nuevo.",
                      );
                    }
                  });
                }}
              >
                A Backlog
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

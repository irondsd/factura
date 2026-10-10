import Link from "next/link";
import { TAG_LABELS } from "../labels";
import { taskListHref } from "../query";
import type { TaskTag } from "../types";
import styles from "./Tasks.module.css";

export function TaskFilters({
  path,
  search,
  tag,
  dismissed,
}: {
  path: string;
  search: string;
  tag?: TaskTag;
  dismissed?: boolean;
}) {
  return (
    <div className={styles.toolbar}>
      <form
        action={path}
        className={styles.filters}
        key={`${search}:${tag ?? ""}:${dismissed}`}
      >
        {dismissed && <input type="hidden" name="view" value="dismissed" />}
        <label className={styles.search}>
          Buscar tarea
          <input
            name="q"
            type="search"
            className={styles.input}
            defaultValue={search}
            placeholder="Título o TASK-42"
            maxLength={200}
          />
        </label>
        <label>
          Etiqueta
          <select name="tag" className={styles.select} defaultValue={tag ?? ""}>
            <option value="">Todas</option>
            {Object.entries(TAG_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className={styles.button}>
          Buscar
        </button>
        {(search || tag) && (
          <Link
            className={styles.button}
            href={taskListHref(path, { search: "", page: 1, dismissed })}
          >
            Limpiar
          </Link>
        )}
      </form>
    </div>
  );
}

export function TaskPagination({
  path,
  search,
  tag,
  page,
  total,
  pageSize,
  dismissed,
}: {
  path: string;
  search: string;
  tag?: TaskTag;
  page: number;
  total: number;
  pageSize: number;
  dismissed?: boolean;
}) {
  if (total <= pageSize && page === 1) return null;
  const href = (number: number) =>
    taskListHref(path, { search, tag, page: number, dismissed });
  return (
    <nav className={styles.pagination} aria-label="Páginas de tareas">
      {page > 1 ? (
        <Link className={styles.button} href={href(page - 1)}>
          Anterior
        </Link>
      ) : (
        <span />
      )}
      <span>
        {total
          ? `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} de ${total}`
          : "Sin resultados"}
      </span>
      {page * pageSize < total ? (
        <Link className={styles.button} href={href(page + 1)}>
          Siguiente
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}

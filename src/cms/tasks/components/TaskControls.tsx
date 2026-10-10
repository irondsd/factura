"use client";

import { useState } from "react";
import { TaskMarkdown } from "./TaskMarkdown";
import type { TaskTag } from "../types";
import { TAG_LABELS } from "../labels";
import styles from "./Tasks.module.css";

export { STATUS_LABELS, TAG_LABELS, BOARD_STATUSES } from "../labels";

export function TaskTags({ tags }: { tags: TaskTag[] }) {
  if (!tags.length) return null;
  return (
    <div className={styles.tags}>
      {tags.map((tag) => (
        <span key={tag} className={styles.tag} data-tag={tag}>
          {TAG_LABELS[tag]}
        </span>
      ))}
    </div>
  );
}

export function TagPicker({
  value,
  onChange,
  disabled,
}: {
  value: TaskTag[];
  onChange: (tags: TaskTag[]) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset className={styles.tagPicker} disabled={disabled}>
      <legend>Etiquetas</legend>
      <div className={styles.tags}>
        {(Object.keys(TAG_LABELS) as TaskTag[]).map((tag) => (
          <label key={tag} className={styles.tagOption}>
            <input
              type="checkbox"
              checked={value.includes(tag)}
              onChange={(event) =>
                onChange(
                  event.target.checked
                    ? [...value, tag]
                    : value.filter((item) => item !== tag),
                )
              }
            />
            {TAG_LABELS[tag]}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function DescriptionEditor({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const [preview, setPreview] = useState(false);
  return (
    <div>
      <div className={styles.editorHeading}>
        <label htmlFor="task-description">Descripción</label>
        <div className={styles.editorTabs} aria-label="Modo de descripción">
          <button
            type="button"
            aria-pressed={!preview}
            onClick={() => setPreview(false)}
          >
            Escribir
          </button>
          <button
            type="button"
            aria-pressed={preview}
            onClick={() => setPreview(true)}
          >
            Vista previa
          </button>
        </div>
      </div>
      {preview ? (
        <div
          className={styles.preview}
          aria-label="Vista previa de la descripción"
        >
          {value.trim() ? (
            <TaskMarkdown>{value}</TaskMarkdown>
          ) : (
            <p className={styles.empty}>Sin descripción.</p>
          )}
        </div>
      ) : (
        <textarea
          id="task-description"
          className={styles.description}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
          maxLength={100000}
          rows={12}
          placeholder="Describe qué hay que hacer…"
        />
      )}
      <p className={styles.hint}>
        Markdown: listas, casillas, enlaces y bloques de código.
      </p>
    </div>
  );
}

"use client";

import { startCompletion } from "@codemirror/autocomplete";
import type { EditorView } from "@codemirror/view";
import { useEffect, useId, useRef, useState } from "react";
import { CmsIcon, type CmsIconName } from "../icons";
import { MediaPicker } from "../media/components/MediaPicker";
import type { MediaAsset } from "../media/types";
import { CmsDialog, DialogButton, DialogCancel } from "./CmsDialog";
import styles from "./MarkdownToolbar.module.css";
import {
  applyTransaction,
  blockFormatTransaction,
  clearFormattingTransaction,
  dividerTransaction,
  footnoteTransaction,
  inlineFormatTransaction,
  insertMarkdownTransaction,
  listFormatTransaction,
  tableTransaction,
  type BlockFormat,
  type InlineFormat,
  type ListFormat,
} from "./markdownFormatting";

const BLOCK_LABELS: Record<BlockFormat, string> = {
  paragraph: "Párrafo",
  "heading-2": "Título 2",
  "heading-3": "Título 3",
  "heading-4": "Título 4",
  quote: "Cita",
  "code-block": "Bloque de código",
};

function ToolButton({
  label,
  icon,
  shortcut,
  className,
  onClick,
}: {
  label: string;
  icon: CmsIconName;
  shortcut?: string;
  className?: string;
  onClick: () => void;
}) {
  const title = shortcut ? `${label} (${shortcut})` : label;
  return (
    <button
      type="button"
      className={`${styles.button} ${className ?? ""}`}
      aria-label={label}
      title={title}
      onClick={onClick}
    >
      <CmsIcon name={icon} size="md" />
    </button>
  );
}

function MenuItem({
  icon,
  label,
  shortcut,
  className,
  onClick,
}: {
  icon: CmsIconName;
  label: string;
  shortcut?: string;
  className?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`${styles.menuItem} ${className ?? ""}`}
      aria-label={label}
      onClick={onClick}
    >
      <CmsIcon name={icon} size="md" />
      <span>{label}</span>
      {shortcut && <kbd className={styles.menuShortcut}>{shortcut}</kbd>}
    </button>
  );
}

export function MarkdownToolbar({
  getView,
  blockFormat,
}: {
  getView: () => EditorView | null;
  blockFormat: BlockFormat;
}) {
  const more = useRef<HTMLDetailsElement>(null);
  const imageWasOpen = useRef(false);
  const [imageOpen, setImageOpen] = useState(false);

  useEffect(() => {
    const closeOnOutsidePress = (event: PointerEvent) => {
      if (!more.current?.open || more.current.contains(event.target as Node)) {
        return;
      }
      more.current.removeAttribute("open");
    };
    document.addEventListener("pointerdown", closeOnOutsidePress);
    return () =>
      document.removeEventListener("pointerdown", closeOnOutsidePress);
  }, []);

  useEffect(() => {
    if (imageWasOpen.current && !imageOpen) {
      more.current?.querySelector<HTMLElement>("summary")?.focus();
    }
    imageWasOpen.current = imageOpen;
  }, [imageOpen]);

  const closeMore = () => more.current?.removeAttribute("open");
  const apply = (build: Parameters<typeof applyTransaction>[1]) => {
    const view = getView();
    if (view) applyTransaction(view, build);
    closeMore();
  };
  const inline = (format: InlineFormat) =>
    apply((state) => inlineFormatTransaction(state, format));
  const block = (format: BlockFormat) =>
    apply((state) => blockFormatTransaction(state, format));
  const list = (format: ListFormat) =>
    apply((state) => listFormatTransaction(state, format));

  const components = () => {
    const view = getView();
    closeMore();
    if (!view) return;
    view.focus();
    startCompletion(view);
  };

  return (
    <>
      <div
        className={styles.toolbar}
        role="group"
        aria-label="Formato Markdown"
      >
        <div className={styles.group}>
          <select
            value={blockFormat}
            aria-label="Formato de bloque"
            title="Formato de bloque"
            className={styles.blockSelect}
            onChange={(event) => block(event.target.value as BlockFormat)}
          >
            {Object.entries(BLOCK_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.group}>
          <ToolButton
            label="Negrita"
            icon="bold"
            shortcut="⌘/Ctrl+B"
            onClick={() => inline("bold")}
          />
          <ToolButton
            label="Cursiva"
            icon="italic"
            shortcut="⌘/Ctrl+I"
            onClick={() => inline("italic")}
          />
          <ToolButton
            label="Enlace"
            icon="link"
            shortcut="⌘/Ctrl+K"
            onClick={() => inline("link")}
          />
          <ToolButton
            label="Código en línea"
            icon="code"
            className={styles.desktopOnly}
            onClick={() => inline("code")}
          />
          <ToolButton
            label="Quitar formato"
            icon="removeFormatting"
            className={styles.desktopOnly}
            onClick={() => apply(clearFormattingTransaction)}
          />
        </div>

        <div className={`${styles.group} ${styles.desktopOnly}`}>
          <ToolButton
            label="Lista con viñetas"
            icon="list"
            onClick={() => list("bullet-list")}
          />
          <ToolButton
            label="Lista numerada"
            icon="listOrdered"
            onClick={() => list("numbered-list")}
          />
        </div>

        <details
          ref={more}
          className={styles.more}
          onKeyDown={(event) => {
            if (event.key !== "Escape") return;
            event.preventDefault();
            closeMore();
            more.current?.querySelector<HTMLElement>("summary")?.focus();
          }}
        >
          <summary className={styles.summary}>
            <span className={styles.desktopOnly}>Insertar</span>
            <span className={styles.mobileOnly}>Más</span>
            <CmsIcon name="chevronDown" size="xs" />
          </summary>
          <div className={styles.menu}>
            <MenuItem
              icon="braces"
              label="Componentes y recetas"
              shortcut="⌘/Ctrl+⇧K"
              onClick={components}
            />
            <MenuItem
              icon="image"
              label="Imagen de la biblioteca"
              onClick={() => {
                closeMore();
                setImageOpen(true);
              }}
            />
            <MenuItem
              icon="table"
              label="Tabla"
              onClick={() => apply(tableTransaction)}
            />
            <MenuItem
              icon="quote"
              label="Nota al pie"
              onClick={() => apply(footnoteTransaction)}
            />
            <MenuItem
              icon="minus"
              label="Separador"
              onClick={() => apply(dividerTransaction)}
            />
            <MenuItem
              icon="code"
              label="Código en línea"
              className={styles.mobileOnly}
              onClick={() => inline("code")}
            />
            <MenuItem
              icon="list"
              label="Lista con viñetas"
              className={styles.mobileOnly}
              onClick={() => list("bullet-list")}
            />
            <MenuItem
              icon="listOrdered"
              label="Lista numerada"
              className={styles.mobileOnly}
              onClick={() => list("numbered-list")}
            />
            <MenuItem
              icon="removeFormatting"
              label="Quitar formato"
              className={`${styles.mobileOnly} ${styles.clearMenuItem}`}
              onClick={() => apply(clearFormattingTransaction)}
            />
          </div>
        </details>
      </div>

      {imageOpen && (
        <BodyImageDialog
          onClose={() => setImageOpen(false)}
          onInsert={(markdown) => {
            setImageOpen(false);
            // CmsDialog restores focus to its opener while unmounting. Apply
            // on the next frame so the caret finishes back in the editor.
            requestAnimationFrame(() =>
              apply((state) => insertMarkdownTransaction(state, markdown)),
            );
          }}
        />
      )}
    </>
  );
}

function BodyImageDialog({
  onClose,
  onInsert,
}: {
  onClose: () => void;
  onInsert: (markdown: string) => void;
}) {
  const descriptionId = useId();
  const altId = useId();
  const [asset, setAsset] = useState<MediaAsset | null>(null);
  const [alt, setAlt] = useState("");
  const [decorative, setDecorative] = useState(false);

  return (
    <CmsDialog
      eyebrow="Markdown"
      title="Insertar una imagen"
      width="620px"
      onClose={onClose}
    >
      <p
        id={descriptionId}
        className="mt-3 mb-4 font-mono text-[13px] leading-[1.6] text-muted"
      >
        Elige una imagen lista para usar y confirma cómo debe describirse en
        esta página.
      </p>

      <MediaPicker
        value={asset?.id ?? null}
        describedBy={descriptionId}
        onChange={() => undefined}
        onAssetChange={(next) => {
          setAsset(next);
          if (next) {
            setAlt(next.defaultAlt);
            setDecorative(next.decorative);
          }
        }}
      />

      {asset && (
        <div className="mt-4 border-t border-line pt-4">
          <label
            htmlFor={altId}
            className="block font-mono text-micro uppercase tracking-label-wide text-muted"
          >
            Texto alternativo
          </label>
          <input
            id={altId}
            value={alt}
            disabled={decorative}
            onChange={(event) => setAlt(event.target.value)}
            className="mt-2 w-full border border-line bg-paper px-3 py-2 font-mono text-[13px] text-ink outline-none focus:border-accent disabled:opacity-45"
          />
          <label className="mt-3 flex min-h-11 cursor-pointer items-center gap-3 font-mono text-[12px] text-muted">
            <input
              type="checkbox"
              checked={decorative}
              onChange={(event) => setDecorative(event.target.checked)}
              className="size-4 accent-[var(--accent)]"
            />
            Es decorativa; no necesita descripción
          </label>
        </div>
      )}

      <div className="mt-5 flex items-center gap-2 border-t border-line pt-4">
        <DialogButton
          tone="accent"
          icon="image"
          disabled={!asset || (!decorative && !alt.trim())}
          onClick={() => {
            if (!asset) return;
            const safeAlt = decorative
              ? ""
              : alt.trim().replaceAll("\\", "\\\\").replaceAll("]", "\\]");
            onInsert(`![${safeAlt}](${asset.permalink})`);
          }}
        >
          Insertar imagen
        </DialogButton>
        <DialogCancel onClick={onClose} />
      </div>
    </CmsDialog>
  );
}

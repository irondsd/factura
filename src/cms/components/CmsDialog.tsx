"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";

// The CMS's own dialogs, replacing the `window.confirm` / `window.prompt` calls
// the first iteration shipped with.
//
// Native dialogs were fine while the console was being built and wrong as soon
// as it was being used: they can't say which page they are about, they can't
// show the consequence of the thing they are asking about, they can't stay open
// while the server thinks, and «Publicar» and «Eliminar definitivamente» arrive
// in the same grey OS box as a cookie warning. These carry the CMS's own
// vocabulary — mono uppercase eyebrow, hairline border, square corners, the
// same marks and tones the status chip uses — so the weight of the question is
// visible before it is read.
//
// Local rather than a reuse of `@/components/ConfirmDialog`: that one reads its
// labels from `useI18n`, and the CMS has no I18n provider on purpose (§2.2 — a
// Spanish-only internal tool, no locale proxy). Sharing it would mean giving
// the console a provider it exists without.

/** Everything that can hold focus inside a panel, for the Tab loop below. */
const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

/** The tones a dialog's confirming button can wear. They are the ones already
 * on the CMS's screens, so the button in the dialog matches the button that
 * opened it: the accent as the default, `ok` for the one that puts a page in
 * front of readers, ochre for the half-public middle, and the dashed quiet one
 * for stepping back down. */
const TONES = {
  accent: "border-accent bg-accent text-paper hover:border-ink hover:bg-ink",
  ok: "border-ok bg-ok text-paper hover:border-ink hover:bg-ink",
  ochre:
    "border-[var(--vendor-ochre)] text-[var(--vendor-ochre)] hover:bg-[var(--vendor-ochre)] hover:text-paper",
  quiet: "border-dashed border-line text-muted hover:border-ink hover:text-ink",
} as const;

export type DialogTone = keyof typeof TONES;

/** The confirming button. Not `@/components/ui`'s `Button`: the CMS's controls
 * are a slightly wider-tracked dialect of the same system, and a dialog whose
 * buttons don't match the ones behind it looks borrowed. */
export function DialogButton({
  tone,
  mark,
  className,
  children,
  ...rest
}: {
  tone: DialogTone;
  mark?: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...rest}
      className={cn(
        "inline-flex cursor-pointer items-center gap-2 border px-3 py-2 font-mono text-micro uppercase tracking-label-wide transition-colors disabled:cursor-not-allowed disabled:opacity-45",
        TONES[tone],
        className,
      )}
    >
      {mark && <span aria-hidden="true">{mark}</span>}
      {children}
    </button>
  );
}

/** The «no» half of every dialog: a bare label, so the two answers never look
 * like the same choice twice. */
export function DialogCancel({
  onClick,
  disabled,
  children = "Cancelar",
}: {
  onClick: () => void;
  disabled?: boolean;
  children?: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="ml-auto cursor-pointer px-3 py-2 font-mono text-micro uppercase tracking-label-wide text-muted transition-colors hover:text-accent disabled:cursor-not-allowed disabled:opacity-45"
    >
      {children}
    </button>
  );
}

/**
 * The shell: backdrop, panel, and the three things a modal owes the keyboard —
 * focus moves in on open, Tab stays inside, Escape and the backdrop close it.
 * Focus returns to whatever opened it, so dismissing a dialog puts the caret
 * back on the button that raised it rather than at the top of the document.
 *
 * `busy` seals it: while the server is working, Escape and the backdrop stop
 * closing. A request already in flight can't be called back, and a dialog that
 * vanishes mid-write leaves the editor guessing whether it happened.
 *
 * Mount it conditionally — there is no `open` prop, so the mount *is* the open,
 * and the state inside a prompt resets by construction each time.
 */
export function CmsDialog({
  eyebrow,
  title,
  busy = false,
  onClose,
  children,
  width = "420px",
}: {
  eyebrow?: string;
  title: string;
  busy?: boolean;
  onClose: () => void;
  children: ReactNode;
  width?: string;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();

  // Focus in on mount, back out on unmount. `document.activeElement` is read
  // once, at open: by the time this unmounts the opening button may itself be
  // gone (a deleted collection takes its row with it), and `?.focus?.()` is
  // what keeps that from throwing on the way out.
  useEffect(() => {
    const opener =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const first = panel.current?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? panel.current)?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      if (opener?.isConnected) opener.focus();
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (busy) return;
        event.preventDefault();
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !panel.current) return;
      const nodes = [
        ...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE),
      ].filter((node) => node.offsetParent !== null);
      if (nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const active = document.activeElement;
      // Wrapping both ways, and pulling focus back in if it escaped the panel
      // entirely — which it has, on mount, when the panel itself holds it.
      if (event.shiftKey && (active === first || active === panel.current)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    // Capture, so the editor's own window-level shortcuts (⌘S) don't see keys
    // that were meant for the dialog on top of them.
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [busy, onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-6">
      {/* Its own layer, so click-to-close needs no stopPropagation on the
          panel and the centring box carries no scrollbar. */}
      <div
        onClick={() => !busy && onClose()}
        className="absolute inset-0 bg-[color-mix(in_srgb,var(--ink)_28%,transparent)]"
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        style={{ width: `min(${width}, 92vw)` }}
        className="relative max-h-[86vh] overflow-auto border border-line bg-card p-6 shadow-pop outline-none"
      >
        {eyebrow && (
          <p className="m-0 font-mono text-micro uppercase tracking-label-wide text-accent">
            {eyebrow}
          </p>
        )}
        <h2
          id={titleId}
          className="mt-2 mb-0 font-display text-[19px] font-semibold tracking-[-0.02em] leading-[1.25]"
        >
          {title}
        </h2>
        {children}
      </div>
    </div>,
    document.body,
  );
}

/**
 * «¿Seguro?», with the consequence attached.
 *
 * `description` is the sentence that says what happens; `details` are the
 * separately-true things worth listing rather than running together in a
 * paragraph, set off by the accent rule the parser dialogs use for the same
 * job. Both optional: some questions are just questions.
 */
export function CmsConfirmDialog({
  eyebrow,
  title,
  description,
  details,
  confirmLabel,
  confirmMark,
  cancelLabel,
  tone = "accent",
  busy = false,
  onConfirm,
  onCancel,
}: {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  details?: readonly string[];
  confirmLabel: string;
  confirmMark?: string;
  cancelLabel?: string;
  tone?: DialogTone;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <CmsDialog eyebrow={eyebrow} title={title} busy={busy} onClose={onCancel}>
      {description && (
        <p className="mt-3 mb-0 font-mono text-[13px] leading-[1.6] text-muted">
          {description}
        </p>
      )}
      {details && details.length > 0 && (
        <ul className="mt-4 mb-0 flex list-none flex-col gap-2 border-l-2 border-accent pl-3">
          {details.map((detail) => (
            <li
              key={detail}
              className="font-mono text-[12px] leading-[1.6] text-muted"
            >
              {detail}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <DialogButton
          tone={tone}
          mark={confirmMark}
          onClick={onConfirm}
          disabled={busy}
        >
          {busy ? "…" : confirmLabel}
        </DialogButton>
        <DialogCancel onClick={onCancel} disabled={busy}>
          {cancelLabel}
        </DialogCancel>
      </div>
    </CmsDialog>
  );
}

/**
 * The replacement for `window.prompt`: one text field, asked for by name.
 *
 * It keeps its own `error` because the thing it asks for can be refused by the
 * server — a name already taken, a name too long — and the answer belongs next
 * to the field that produced it, with the typed value still there to fix.
 * That is the part a native prompt cannot do at all: it throws the text away on
 * the way out and leaves the page to explain the failure somewhere else.
 */
export function CmsPromptDialog({
  eyebrow,
  title,
  description,
  label,
  placeholder,
  initialValue = "",
  maxLength,
  confirmLabel,
  busy = false,
  error,
  onSubmit,
  onCancel,
}: {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  label: string;
  placeholder?: string;
  initialValue?: string;
  maxLength?: number;
  confirmLabel: string;
  busy?: boolean;
  error?: string | null;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initialValue);
  const fieldId = useId();
  const errorId = useId();
  const trimmed = value.trim();

  const submit = useCallback(() => {
    if (!trimmed || busy) return;
    onSubmit(trimmed);
  }, [busy, onSubmit, trimmed]);

  return (
    <CmsDialog eyebrow={eyebrow} title={title} busy={busy} onClose={onCancel}>
      {description && (
        <p className="mt-3 mb-0 font-mono text-[13px] leading-[1.6] text-muted">
          {description}
        </p>
      )}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <label
          htmlFor={fieldId}
          className="mt-5 mb-1 block font-mono text-micro uppercase tracking-label-wide text-muted"
        >
          {label}
        </label>
        <input
          id={fieldId}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          // Enter submits. Stated rather than left to the browser's implicit
          // submission, which is conditional on things this field has no
          // control over — and `window.prompt` took Enter, so the thing
          // replacing it has to, unconditionally.
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            submit();
          }}
          placeholder={placeholder}
          maxLength={maxLength}
          disabled={busy}
          autoComplete="off"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className="w-full border border-line bg-paper px-3 py-2 font-mono text-[13px] text-ink outline-none transition-colors focus:border-accent disabled:opacity-50"
        />
        {error && (
          <p
            id={errorId}
            role="alert"
            className="mt-2 mb-0 font-mono text-[12px] leading-[1.6] text-[var(--vendor-ochre)]"
          >
            {error}
          </p>
        )}
        <div className="mt-6 flex flex-wrap items-center gap-2">
          <DialogButton
            tone="accent"
            type="submit"
            disabled={busy || trimmed.length === 0}
          >
            {busy ? "…" : confirmLabel}
          </DialogButton>
          <DialogCancel onClick={onCancel} disabled={busy} />
        </div>
      </form>
    </CmsDialog>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  deleteContentAction,
  saveContentAction,
  setContentStatusAction,
  validateContentAction,
  type CmsActionResult,
} from "@/cms/server/actions";
import {
  FIELD_GROUPS,
  type FieldDescriptor,
  fieldState,
  readField,
  toPatch,
} from "@/cms/forms/fields";
import type { CmsSection } from "@/cms/sections";
import {
  cmsPreviewPath,
  cmsSectionPath,
  publicSectionPath,
} from "@/cms/sections";
import type {
  ContentDocument,
  ContentStatus,
  Diagnostic,
} from "@/content-system/types";
import type { ValidationLevel } from "./ValidationPanel";
import type { HistoryEntry } from "@/cms/history";
import { cn } from "@/lib/cn";
import { HistoryPanel } from "./HistoryPanel";
import { MarkdownEditor } from "./MarkdownEditor";
import { StatusChip, statusLabel } from "./StatusChip";
import { MetadataField, type ParentOption } from "./fields/MetadataField";
import { ValidationPanel } from "./ValidationPanel";
import Link from "next/link";

// The editor. One client component holding the whole page's draft state, so
// "are there unsaved changes" has a single answer and Save sends one patch.
//
// Explicit Save only (§3.4): no autosave in iteration 1. Editing a published
// page edits the live copy, and a save that happened because someone paused
// typing is not a decision anyone made.

type Tab = "markdown" | "preview" | "validation" | "history";

/** What to say when an action fails in a way it does not model — the database
 * is down, a deploy landed mid-request. Better than a button that spins
 * forever, and it never claims the work was saved. */
const UNEXPECTED =
  "Algo falló al hablar con el servidor. Tus cambios siguen en pantalla; vuelve a intentarlo.";

export function PageEditor({
  section,
  page,
  fields,
  parentOptions,
  history,
}: {
  section: CmsSection;
  page: ContentDocument;
  fields: readonly FieldDescriptor[];
  parentOptions: readonly ParentOption[];
  /** Rendered on the server and refreshed by `router.refresh()` after every
   * mutation, so a save shows up in the tab without a reload. */
  history: readonly HistoryEntry[];
}) {
  const router = useRouter();

  const [values, setValues] = useState<Record<string, unknown>>(() =>
    Object.fromEntries(fields.map((f) => [f.path, readField(page, f.path)])),
  );
  const [body, setBody] = useState(page.body);
  const [lockVersion, setLockVersion] = useState(page.lockVersion);
  const [status, setStatus] = useState(page.status);

  const [tab, setTab] = useState<Tab>("markdown");
  const [diagnostics, setDiagnostics] = useState<readonly Diagnostic[]>([]);
  /** Which gate the diagnostics on screen were produced by. A save reports
   * against the level its own status demands; «Revisar» always asks the
   * publish question. Tracked so the panel can say which one it is showing
   * rather than assuming. */
  const [checkedLevel, setCheckedLevel] = useState<ValidationLevel | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{
    kind: "ok" | "error";
    text: string;
  } | null>(null);
  const [conflict, setConflict] = useState(false);

  // The last saved snapshot, held as state rather than a ref: "are there
  // unsaved changes" is rendered, so it is state by definition. Comparing
  // against the snapshot (rather than tracking a boolean) means undoing an edit
  // by hand clears the warning instead of leaving it stuck on.
  const [saved, setSaved] = useState({ values, body });
  const dirty =
    body !== saved.body ||
    JSON.stringify(values) !== JSON.stringify(saved.values);

  // Warn before leaving with unsaved work (§3.4). The browser supplies the
  // wording; all a page can do is ask for the prompt.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const patch = useCallback(() => {
    const { columns, metadata } = toPatch(fields, values);
    return { ...columns, metadata, body };
  }, [fields, values, body]);

  const handle = useCallback(
    <T,>(
      result: CmsActionResult<T>,
      onOk: (data: T) => void,
      okText: string,
    ) => {
      if (result.ok) {
        setConflict(false);
        setDiagnostics([]);
        setCheckedLevel(levelForStatus(status));
        onOk(result.data);
        setNotice({ kind: "ok", text: okText });
        return;
      }
      if (result.kind === "conflict") {
        // No notice: `ConflictNotice` below is the message, in Spanish and with
        // the recovery path attached. The service's own wording is
        // developer-facing and names a UUID.
        setConflict(true);
        setNotice(null);
        return;
      }
      if (result.kind === "invalid") {
        const diagnostics = result.diagnostics ?? [];
        const errors = diagnostics.filter((d) => d.severity === "error").length;
        setDiagnostics(diagnostics);
        setCheckedLevel(levelForStatus(status));
        setTab("validation");
        // The service's own message is developer-facing English; the console is
        // Spanish, and the detail is in the panel below anyway.
        setNotice({
          kind: "error",
          text: `No se guardó: ${errors} ${errors === 1 ? "problema" : "problemas"} que hay que resolver primero. Están abajo, en Revisión.`,
        });
        return;
      }
      // `slug_taken`, `forbidden` and `not_found` do carry a message worth
      // showing: they name the slug, the permission or the page.
      setNotice({ kind: "error", text: result.message });
    },
    [status],
  );

  const save = useCallback(async () => {
    setBusy(true);
    setNotice(null);
    try {
      const result = await saveContentAction(section.id, {
        id: page.id,
        expectedLockVersion: lockVersion,
        patch: patch(),
      });
      handle(
        result,
        (data) => {
          setLockVersion(data.lockVersion);
          setSaved({ values, body });
          router.refresh();
        },
        "Guardado.",
      );
    } catch {
      setNotice({ kind: "error", text: UNEXPECTED });
    }
    setBusy(false);
  }, [handle, lockVersion, page.id, patch, router, section.id, values, body]);

  // Keep the browser's familiar save shortcut inside the CMS. Capture it at
  // window level so it also works while the CodeMirror editor has focus, and
  // use the same save path as the visible button so metadata and Markdown are
  // committed together.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.isComposing ||
        !event.metaKey ||
        event.key.toLowerCase() !== "s"
      ) {
        return;
      }

      event.preventDefault();
      if (!busy) void save();
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [busy, save]);

  const check = async () => {
    setBusy(true);
    setNotice(null);
    try {
      // Always the publish gate, whatever state the page is in. A draft is
      // checked for grammar alone when it is *saved*, which is right — but
      // «Revisar» is the button someone presses to find out whether the page is
      // ready, and answering the easier question would report a draft as clean
      // right up until publishing refused it.
      const result = await validateContentAction({
        id: page.id,
        patch: patch(),
        level: "publish",
      });
      if (result.ok) {
        setDiagnostics(result.data.diagnostics);
        setCheckedLevel("publish");
        setTab("validation");
      } else {
        setNotice({ kind: "error", text: result.message });
      }
    } catch {
      setNotice({ kind: "error", text: UNEXPECTED });
    }
    setBusy(false);
  };

  const transition = async (next: ContentStatus) => {
    if (dirty) {
      setNotice({
        kind: "error",
        text: "Guarda los cambios antes de cambiar el estado.",
      });
      return;
    }
    if (!window.confirm(confirmText(next, status))) return;

    setBusy(true);
    setNotice(null);
    try {
      const result = await setContentStatusAction(section.id, {
        id: page.id,
        status: next,
        expectedLockVersion: lockVersion,
      });
      handle(
        result,
        (data) => {
          setStatus(data.status);
          setLockVersion(data.lockVersion);
          router.refresh();
        },
        next === "published" ? "Publicada." : `Estado: ${statusLabel(next)}.`,
      );
    } catch {
      setNotice({ kind: "error", text: UNEXPECTED });
    }
    setBusy(false);
  };

  /** Delete the page. Confirmed in `DeletePanel` by typing the word rather
   * than by a dialog: `window.confirm` is the right weight for a status flip
   * that can be flipped back, and the wrong weight for the one action in the
   * CMS with nothing behind it to restore from. */
  const remove = async () => {
    setBusy(true);
    setNotice(null);
    try {
      const result = await deleteContentAction(section.id, {
        id: page.id,
        expectedLockVersion: lockVersion,
      });
      if (result.ok) {
        // Leave first, and stay busy while doing it: this editor is bound to a
        // row that no longer exists, and anything it re-renders from here is
        // showing a page that is gone.
        router.push(cmsSectionPath(section.id));
        router.refresh();
        return;
      }
      setNotice({
        kind: "error",
        text:
          result.kind === "conflict"
            ? "Alguien más guardó esta página mientras la tenías abierta. Recarga y vuelve a mirarla antes de eliminarla."
            : result.message,
      });
    } catch {
      setNotice({ kind: "error", text: UNEXPECTED });
    }
    setBusy(false);
  };

  // The sidebar, resolved against the document as it stands. A field whose
  // condition the page does not meet is dropped here rather than rendered
  // disabled, and a group left with nothing loses its heading too — an empty
  // «Ubicación» would be as much noise as the field was. Depends on `body`, so
  // typing `<Faq />` into the Markdown brings its questions into the form
  // without a save.
  const grouped = useMemo(
    () =>
      FIELD_GROUPS.map((group) => {
        const entries = fields
          .filter((field) => field.group === group.id)
          .map((field) => ({ field, ...fieldState(field, { body, values }) }));
        return {
          ...group,
          fields: entries.filter((entry) => entry.visible),
          // A field only a tag in the body can bring back leaves one line
          // behind saying which tag. Without it "where did the FAQ go" is a
          // fair question with no answer anywhere on screen — this editor has
          // no component palette to discover `<Faq />` from.
          hints: entries.flatMap((entry) =>
            !entry.visible && entry.field.placedBy
              ? [
                  {
                    path: entry.field.path,
                    label: entry.field.label,
                    component: entry.field.placedBy,
                  },
                ]
              : [],
          ),
        };
      }).filter((group) => group.fields.length > 0 || group.hints.length > 0),
    [fields, body, values],
  );

  const invalidFields = useMemo(
    () => new Set(diagnostics.map((d) => d.field).filter(Boolean) as string[]),
    [diagnostics],
  );

  return (
    <div>
      <header className="mb-7">
        <div className="flex flex-wrap items-center gap-3 mb-2">
          <StatusChip status={status} />
          {dirty && (
            <span className="font-mono text-micro uppercase tracking-label-wide text-[var(--vendor-ochre)]">
              Sin guardar
            </span>
          )}
        </div>
        <h1 className="font-display font-semibold text-[28px] tracking-[-0.025em] leading-[1.15] m-0">
          {(values.title as string) || "Sin título"}
        </h1>
        {status === "draft" && (
          <p className="font-mono text-[12px] text-muted mt-2 mb-0">
            {publicSectionPath(section.id)}/
            {(values.slug as string) ?? page.slug}
          </p>
        )}
        {status !== "draft" && (
          <Link
            className="font-mono text-[12px] text-muted mt-2 mb-0 underline hover:text-accent"
            target="_blank"
            rel="noreferrer"
            href={`${publicSectionPath(section.id)}/${(values.slug as string) ?? page.slug}`}
          >
            {publicSectionPath(section.id)}/
            {(values.slug as string) ?? page.slug}
          </Link>
        )}
      </header>

      {notice && (
        <p
          role="status"
          aria-live="polite"
          className={cn(
            "border-l-2 pl-4 py-2 font-mono text-[13px] leading-[1.6] mb-5",
            notice.kind === "ok"
              ? "border-accent text-ink"
              : "border-[var(--vendor-ochre)] text-ink",
          )}
        >
          {notice.text}
        </p>
      )}

      {conflict && <ConflictNotice body={body} />}

      {page.metadataError && (
        <MetadataDamageNotice detail={page.metadataError} />
      )}

      {status === "published" && (
        <p className="border border-line bg-card px-4 py-3 font-mono text-[12px] leading-[1.6] text-muted mb-6">
          Esta página está publicada: lo que guardas acá es la copia que está en
          línea. El sitio público la muestra actualizada en la siguiente visita.
        </p>
      )}

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="min-w-0">
          <Tabs tab={tab} onChange={setTab} />

          <div className={tab === "markdown" ? "" : "hidden"}>
            <MarkdownEditor
              value={page.body}
              onChange={setBody}
              diagnostics={diagnostics}
              label="Cuerpo de la página en Markdown"
            />
          </div>

          {tab === "preview" && (
            <PreviewPane
              src={cmsPreviewPath(section.id, page.id)}
              dirty={dirty}
            />
          )}

          {tab === "validation" && (
            <ValidationPanel diagnostics={diagnostics} level={checkedLevel} />
          )}

          {tab === "history" && <HistoryPanel entries={history} />}
        </section>

        <aside className="min-w-0">
          <div className="flex gap-2 mb-7">
            <button
              type="button"
              onClick={save}
              disabled={busy}
              className="border w-1/2 cursor-pointer border-accent bg-accent px-4 py-2 font-mono text-micro uppercase tracking-label-wide text-paper transition-colors hover:border-ink hover:bg-ink disabled:opacity-50"
            >
              {busy ? "…" : "Guardar"}
            </button>
            <button
              type="button"
              onClick={check}
              disabled={busy}
              title="Comprueba la página contra todo lo que hace falta para publicarla"
              className="border w-1/2 cursor-pointer border-line px-4 py-2 font-mono text-micro uppercase tracking-label-wide text-muted hover:border-accent hover:text-accent disabled:opacity-50"
            >
              Revisar
            </button>
          </div>

          <StatusControls
            status={status}
            busy={busy}
            dirty={dirty}
            onTransition={transition}
          />

          {grouped.map((group) => (
            <section key={group.id} className="mb-8">
              <h2 className="font-mono text-micro uppercase tracking-label-wide text-accent border-b border-line pb-2 mb-4">
                {group.label}
              </h2>
              {group.fields.map(({ field, required }) => (
                <MetadataField
                  key={field.path}
                  field={field}
                  required={required}
                  value={values[field.path]}
                  invalid={invalidFields.has(
                    field.path.replace("metadata.", ""),
                  )}
                  parentOptions={parentOptions}
                  onChange={(next) =>
                    setValues((current) => ({ ...current, [field.path]: next }))
                  }
                />
              ))}
              {group.hints.map((hint) => (
                <p
                  key={hint.path}
                  className="font-mono text-[12px] leading-[1.6] text-muted mt-0 mb-6"
                >
                  Escribe{" "}
                  <span className="text-ink">{`<${hint.component} />`}</span> en
                  el cuerpo para completar «{hint.label}».
                </p>
              ))}
            </section>
          ))}

          <DeletePanel status={status} busy={busy} onDelete={remove} />
        </aside>
      </div>
    </div>
  );
}

function Tabs({ tab, onChange }: { tab: Tab; onChange: (t: Tab) => void }) {
  const items: { id: Tab; label: string }[] = [
    { id: "markdown", label: "Markdown" },
    { id: "preview", label: "Vista previa" },
    { id: "validation", label: "Revisión" },
    { id: "history", label: "Historia" },
  ];
  return (
    <div role="tablist" className="flex gap-1 border-b border-line mb-5">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="tab"
          aria-selected={tab === item.id}
          onClick={() => onChange(item.id)}
          className={cn(
            "px-4 py-2 font-mono text-micro uppercase tracking-label-wide border-b-2 -mb-px transition-colors",
            tab === item.id
              ? "border-accent text-accent"
              : "border-transparent text-muted hover:text-accent",
          )}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

/** The preview shows the last *saved* value (§3.4). Saying so is the whole
 * point: an editor comparing the pane with their unsaved edits should know why
 * they differ. */
function PreviewPane({ src, dirty }: { src: string; dirty: boolean }) {
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <p className="font-mono text-[12px] text-muted m-0">
          {dirty
            ? "Muestra la última versión guardada, no los cambios sin guardar."
            : "Muestra la última versión guardada."}
        </p>
        <a
          href={src}
          target="_blank"
          rel="noreferrer"
          className="font-mono text-micro uppercase tracking-label-wide text-muted no-underline hover:text-accent"
        >
          Abrir en otra pestaña →
        </a>
      </div>
      <iframe
        src={src}
        title="Vista previa de la página guardada"
        className="w-full h-[70vh] border border-line bg-paper"
      />
    </div>
  );
}

/** The three destinations, each with its own weight.
 *
 * They used to be three identical bordered rows in 12px sentence case, which
 * put «Publicar» and the title field one line apart in the same shape — the
 * most consequential control on the page and a text input, told apart only by
 * reading them. So: uppercase mono, which nothing in this sidebar's forms uses;
 * the same mark the status chip carries, so the button and the state it leads
 * to are recognisably the same thing; and a fill that tracks how public the
 * destination is — dashed and quiet on the way back to a draft, outlined in
 * ochre for a preview, solid for the one that puts a page in front of readers. */
const TRANSITIONS: Record<
  ContentStatus,
  { mark: string; label: string; tone: string }
> = {
  draft: {
    mark: "○",
    label: "Volver a borrador",
    tone: "border-dashed border-line text-muted hover:border-ink hover:text-ink",
  },
  preview: {
    mark: "◐",
    label: "Poner en vista previa",
    tone: "border-[var(--vendor-ochre)] text-[var(--vendor-ochre)] hover:bg-[var(--vendor-ochre)] hover:text-paper",
  },
  published: {
    mark: "●",
    label: "Publicar",
    tone: "border-ok bg-ok text-paper hover:border-ink hover:bg-ink",
  },
};

function StatusControls({
  status,
  busy,
  dirty,
  onTransition,
}: {
  status: ContentStatus;
  busy: boolean;
  dirty: boolean;
  onTransition: (next: ContentStatus) => void;
}) {
  const targets = (["draft", "preview", "published"] as const).filter(
    (target) => target !== status,
  );

  return (
    <section className="mb-8">
      <h2 className="font-mono text-micro uppercase tracking-label-wide text-accent border-b border-line pb-2 mb-4">
        Estado
      </h2>
      <div className="flex flex-col gap-2">
        {targets.map((target) => (
          <button
            key={target}
            type="button"
            onClick={() => onTransition(target)}
            disabled={busy || dirty}
            className={cn(
              "inline-flex cursor-pointer items-center gap-2 border px-3 py-2 text-left font-mono text-micro uppercase tracking-label-wide transition-colors disabled:opacity-45",
              TRANSITIONS[target].tone,
            )}
          >
            <span aria-hidden="true">{TRANSITIONS[target].mark}</span>
            {TRANSITIONS[target].label}
          </button>
        ))}
      </div>
      {dirty && (
        <p className="font-mono text-[11px] text-muted mt-2 mb-0">
          Guarda los cambios para poder cambiar el estado.
        </p>
      )}
    </section>
  );
}

/** Deleting a page, at the bottom of the sidebar and behind two steps.
 *
 * Only a draft can go, and the panel says so rather than hiding: "why is there
 * no delete here" is a worse question than a sentence explaining that a live
 * page is unpublished first. The confirmation is a typed word, not a dialog —
 * every other control here is reversible, this one has no revision history
 * behind it, and a `window.confirm` dismissed by reflex is the same click as
 * the button that opened it. */
function DeletePanel({
  status,
  busy,
  onDelete,
}: {
  status: ContentStatus;
  busy: boolean;
  onDelete: () => void;
}) {
  const [armed, setArmed] = useState(false);
  const [typed, setTyped] = useState("");

  const deletable = status === "draft";
  const confirmed = typed.trim().toUpperCase() === "ELIMINAR";

  return (
    <section className="border-t border-line pt-6 mb-8">
      <h2 className="font-mono text-micro uppercase tracking-label-wide text-muted mb-3">
        Eliminar
      </h2>

      {!deletable && (
        <p className="font-mono text-[12px] leading-[1.6] text-muted m-0">
          Solo se eliminan borradores. Vuelve la página a borrador si quieres
          eliminarla.
        </p>
      )}

      {deletable && !armed && (
        <>
          <p className="font-mono text-[12px] leading-[1.6] text-muted mt-0 mb-3">
            Se borra de la base de datos para siempre. No hay historial ni copia
            de la que recuperarla.
          </p>
          <button
            type="button"
            onClick={() => setArmed(true)}
            disabled={busy}
            className="inline-flex items-center gap-2 border border-accent px-3 py-2 font-mono text-micro uppercase tracking-label-wide text-accent transition-colors hover:bg-accent hover:text-paper disabled:opacity-45"
          >
            <span aria-hidden="true">✕</span>
            Eliminar esta página
          </button>
        </>
      )}

      {deletable && armed && (
        <div className="border border-accent px-4 py-4">
          <label
            htmlFor="cms-delete-confirm"
            className="block font-mono text-[12px] leading-[1.6] text-ink mb-3"
          >
            Escribe <strong className="font-semibold">ELIMINAR</strong> para
            confirmar que esta página desaparece para siempre.
          </label>
          <input
            id="cms-delete-confirm"
            autoFocus
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            autoComplete="off"
            className="w-full border border-line bg-paper px-3 py-2 font-mono text-[13px] text-ink focus:border-accent focus:outline-none"
          />
          <div className="flex flex-wrap gap-2 mt-3">
            <button
              type="button"
              onClick={onDelete}
              disabled={busy || !confirmed}
              className="inline-flex items-center gap-2 border border-accent bg-accent px-3 py-2 font-mono text-micro uppercase tracking-label-wide text-paper transition-colors hover:border-ink hover:bg-ink disabled:opacity-45"
            >
              <span aria-hidden="true">✕</span>
              {busy ? "…" : "Eliminar"}
            </button>
            <button
              type="button"
              onClick={() => {
                setArmed(false);
                setTyped("");
              }}
              disabled={busy}
              className="px-3 py-2 font-mono text-micro uppercase tracking-label-wide text-muted transition-colors hover:text-accent disabled:opacity-45"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

/** The stored metadata could not be read back, so the fields on the right are
 * showing empty rather than showing what is in the database.
 *
 * Said plainly and up front, because the failure is silent otherwise: the form
 * looks like a page whose metadata was never filled in, and the first save
 * would replace the unreadable values without anyone knowing there had been
 * any. Saving *is* the repair — it just has to be a decision. */
function MetadataDamageNotice({ detail }: { detail: string }) {
  return (
    <div className="border border-[var(--vendor-ochre)] px-4 py-4 mb-6">
      <p className="font-mono text-[13px] leading-[1.6] text-ink mt-0 mb-2">
        Los metadatos guardados de esta página no se pueden leer, así que los
        campos de la derecha aparecen vacíos. Complétalos y guarda: eso
        reemplaza lo que había.
      </p>
      <pre className="font-mono text-[12px] leading-[1.6] text-muted whitespace-pre-wrap m-0">
        {detail}
      </pre>
    </div>
  );
}

/** A conflict is recoverable, but only if the editor's work survives the
 * recovery — so the losing text is offered for copying before anything
 * reloads. */
function ConflictNotice({ body }: { body: string }) {
  return (
    <div className="border border-[var(--vendor-ochre)] px-4 py-4 mb-6">
      <p className="font-mono text-[13px] leading-[1.6] text-ink mt-0 mb-3">
        Alguien más guardó esta página mientras la editabas. No se ha
        sobrescrito nada. Copia tu texto, recarga y vuelve a aplicarlo.
      </p>
      <textarea
        readOnly
        value={body}
        aria-label="Tu versión sin guardar, para copiar"
        className="w-full h-40 border border-line bg-paper p-3 font-mono text-[12px] text-ink"
      />
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="border border-line px-3 py-1.5 mt-3 font-mono text-micro uppercase tracking-label-wide text-muted hover:border-accent hover:text-accent"
      >
        Recargar
      </button>
    </div>
  );
}

function confirmText(next: ContentStatus, from: ContentStatus): string {
  if (next === "published") {
    return "Publicar esta página. Quedará visible en el sitio público y aparecerá en los listados. ¿Continuar?";
  }
  if (next === "preview") {
    return "Poner en vista previa. La página se verá en su dirección para quien tenga el enlace, pero no aparecerá en listados ni en buscadores. ¿Continuar?";
  }
  return from === "published"
    ? "Volver a borrador. La página dejará de estar publicada y su dirección pública pasará a responder 404. ¿Continuar?"
    : "Volver a borrador. ¿Continuar?";
}

/** Which gate a save of a page in this state has to pass. Mirrors
 * `levelForSave` on the server; duplicated rather than imported because that
 * module is server-only, and the two are one line each. */
const levelForStatus = (status: ContentStatus): ValidationLevel =>
  status === "published"
    ? "publish"
    : status === "preview"
      ? "preview"
      : "draft";

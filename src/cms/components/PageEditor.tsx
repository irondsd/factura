"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  deleteContentAction,
  discardWipAction,
  promotePreviewAction,
  publishContentAction,
  restoreVersionAction,
  saveContentAction,
  setContentStatusAction,
  validateContentAction,
  type CmsActionResult,
} from "@/cms/server/actions";
import type { CmsPageState } from "@/cms/server/contentService";
import type { PageVersions, VersionEntry } from "@/cms/revisions";
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
import { CmsConfirmDialog, type DialogTone } from "./CmsDialog";
import { HistoryPanel } from "./HistoryPanel";
import { MarkdownEditor } from "./MarkdownEditor";
import { StatusChip, statusLabel } from "./StatusChip";
import { MetadataField, type ParentOption } from "./fields/MetadataField";
import { ValidationPanel } from "./ValidationPanel";
import Link from "next/link";

// The editor. One client component holding the whole page's draft state, so
// "are there unsaved changes" has a single answer and Save sends one patch.
//
// Explicit Save only (§3.4): no autosave. A save is a decision, and one that
// happened because somebody paused typing is not one anybody made.
//
// Since revisions (cms.md §14) «Guardar» writes the shared working copy and
// nothing else — the live article keeps serving its last publication until
// «Publicar». Which means there are now three different things on screen that
// could be called "the page", and the header's whole job is to keep them apart:
// what is public, what is saved, and what is in this browser tab.

type Tab = "markdown" | "preview" | "validation" | "history";

/** An action the editor has asked for and not yet confirmed.
 *
 * A union rather than a destination status: «Descartar borrador» and
 * «Restaurar» change no status at all, and modelling them as one would mean the
 * dialog could not say the thing that matters most about them — that nothing
 * public moves. */
type PendingAction =
  | { kind: "publish" }
  | { kind: "preview" }
  | { kind: "unpublish" }
  | { kind: "discard" }
  | { kind: "restore"; version: VersionEntry };

/** Which actions work on what is *saved*, and so refuse to run while the tab
 * holds unsaved edits.
 *
 * Publishing and promoting do: running them with unsaved changes would leave
 * those changes out of the thing the button appears to promise. The other three
 * do not — taking a page down is the recovery lever, and discard and restore
 * replace the working copy outright, so gating them on a clean editor would
 * mean the only way out of a bad edit is to save it first. */
const ACTION_NEEDS_SAVE: Record<PendingAction["kind"], boolean> = {
  publish: true,
  preview: true,
  unpublish: false,
  discard: false,
  restore: false,
};

/** How each action looks, in both places it appears.
 *
 * One table because the dialog has to match the button that opened it — that is
 * the whole reason the CMS grew its own dialogs instead of keeping
 * `window.confirm`, and two tables would drift the first time somebody
 * restyled one of them. `mark` and `tone` go to the dialog; `fill` is the
 * sidebar button's own class, carrying the same colour by hand because a
 * bordered outline button and a solid dialog button are not the same shape.
 *
 * The scale is the status chip's: dashed and quiet for the ones that step back,
 * ochre for the half-public middle, `ok` for the one that puts a page in front
 * of readers, and the accent for the one that destroys work. */
const ACTION_STYLE: Record<
  PendingAction["kind"],
  { mark: string; tone: DialogTone; fill: string }
> = {
  publish: {
    mark: "●",
    tone: "ok",
    fill: "border-ok bg-ok text-paper hover:border-ink hover:bg-ink",
  },
  preview: {
    mark: "◐",
    tone: "ochre",
    fill: "border-[var(--vendor-ochre)] text-[var(--vendor-ochre)] hover:bg-[var(--vendor-ochre)] hover:text-paper",
  },
  unpublish: {
    mark: "○",
    tone: "quiet",
    fill: "border-dashed border-line text-muted hover:border-ink hover:text-ink",
  },
  discard: {
    mark: "✕",
    tone: "accent",
    fill: "border-dashed border-line text-muted hover:border-accent hover:text-accent",
  },
  restore: {
    mark: "↩",
    tone: "accent",
    fill: "border-dashed border-line text-muted hover:border-accent hover:text-accent",
  },
};

/** What to say when an action fails in a way it does not model — the database
 * is down, a deploy landed mid-request. Better than a button that spins
 * forever, and it never claims the work was saved. */
const UNEXPECTED =
  "Algo falló al hablar con el servidor. Tus cambios siguen en pantalla; vuelve a intentarlo.";

export function PageEditor({
  section,
  page,
  state,
  fields,
  parentOptions,
  history,
  versions,
}: {
  section: CmsSection;
  /** The working copy if one is saved, otherwise the baseline an editor starts
   * from — the same document `state.document` carries, passed separately so the
   * form's initial values are obvious at the call site. */
  page: ContentDocument;
  state: CmsPageState;
  fields: readonly FieldDescriptor[];
  parentOptions: readonly ParentOption[];
  /** Rendered on the server and refreshed by `router.refresh()` after every
   * mutation, so a save shows up in the tab without a reload. */
  history: readonly HistoryEntry[];
  versions: PageVersions;
}) {
  const router = useRouter();

  const [values, setValues] = useState<Record<string, unknown>>(() =>
    Object.fromEntries(fields.map((f) => [f.path, readField(page, f.path)])),
  );
  const [body, setBody] = useState(page.body);
  const [lockVersion, setLockVersion] = useState(page.lockVersion);
  const [status, setStatus] = useState(page.status);
  /** Whether a working copy is saved. Tracked separately from `dirty`, which is
   * about this browser tab: «sin guardar» and «borrador guardado» are different
   * claims and the header makes both. */
  const [hasWip, setHasWip] = useState(state.hasWip);

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
  /** The action the editor has asked for and not yet confirmed. Holding the
   * whole action here (rather than a boolean, or the destination status) is
   * what lets the dialog name what it is about and wear the tone of the button
   * that opened it — and «Descartar borrador» and «Restaurar» have no
   * destination status to be named by. */
  const [pending, setPending] = useState<PendingAction | null>(null);

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
          text: `No se guardó: ${errors} ${errors === 1 ? "problema" : "problemas"} que hay que resolver primero. Están abajo, en Validación.`,
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
          setHasWip(true);
          router.refresh();
        },
        status === "published"
          ? "Guardado en el borrador. La página publicada no cambió."
          : "Guardado.",
      );
    } catch {
      setNotice({ kind: "error", text: UNEXPECTED });
    }
    setBusy(false);
  }, [
    handle,
    lockVersion,
    page.id,
    patch,
    router,
    section.id,
    status,
    values,
    body,
  ]);

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
      // Always the publish gate, whatever state the page is in. A working copy
      // is checked for grammar alone when it is *saved*, which is right — it is
      // private — but «Validar» is the button someone presses to find out
      // whether the page is ready, and answering the easier question would
      // report a draft as clean right up until publishing refused it.
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

  /** Ask before doing. Every action that changes what the public sees, plus
   * discard and restore, goes through here.
   *
   * The half that refuses: publishing and promoting act on what is *saved*, so
   * running them with unsaved edits in the tab would quietly leave those edits
   * out of the thing the button appears to promise. Discard and restore replace
   * the working copy outright, and refusing them over unsaved changes would
   * mean the only way out of a bad edit is to save it first — so they are
   * allowed through (`ACTION_NEEDS_SAVE`). */
  const request = (action: PendingAction) => {
    if (ACTION_NEEDS_SAVE[action.kind] && dirty) {
      setNotice({
        kind: "error",
        text: "Guarda los cambios primero: esta acción trabaja sobre lo guardado, no sobre lo que ves en pantalla.",
      });
      return;
    }
    setPending(action);
  };

  /** Do it, once the dialog has been confirmed.
   *
   * Shared by all five because they have the same two obligations after the
   * question is answered: hand the result to `handle`, so a conflict reaches
   * `ConflictNotice` rather than a toast, and keep the dialog sealed until the
   * write lands. */
  const act = async <T,>(
    okText: string,
    run: () => Promise<CmsActionResult<T>>,
    onOk: (data: T) => void,
  ) => {
    setBusy(true);
    setNotice(null);
    try {
      handle(await run(), onOk, okText);
    } catch {
      setNotice({ kind: "error", text: UNEXPECTED });
    }
    setBusy(false);
    // Closed here rather than on click: the dialog stays up, sealed, for as
    // long as the write is in flight, so «Publicar» has a visible middle and
    // not just a before and an after.
    setPending(null);
  };

  const publish = () =>
    act(
      "Publicada.",
      () =>
        publishContentAction(section.id, {
          id: page.id,
          expectedLockVersion: lockVersion,
        }),
      (data) => {
        setStatus(data.status);
        setLockVersion(data.lockVersion);
        // The publication consumed the working copy — the next edit starts from
        // what is now live.
        setHasWip(false);
        setNotice(
          data.noChange
            ? {
                kind: "ok",
                text: "El borrador era idéntico a lo publicado, así que no se creó una versión nueva.",
              }
            : {
                kind: "ok",
                text: `Publicada (versión ${data.publicationNumber}).`,
              },
        );
        router.refresh();
      },
    );

  const promotePreview = () =>
    act(
      "Vista previa pública actualizada.",
      () =>
        promotePreviewAction(section.id, {
          id: page.id,
          expectedLockVersion: lockVersion,
        }),
      (data) => {
        setStatus(data.status);
        setLockVersion(data.lockVersion);
        router.refresh();
      },
    );

  const unpublish = () =>
    act(
      `Estado: ${statusLabel("draft")}.`,
      () =>
        setContentStatusAction(section.id, {
          id: page.id,
          status: "draft",
          expectedLockVersion: lockVersion,
        }),
      (data) => {
        setStatus(data.status);
        setLockVersion(data.lockVersion);
        router.refresh();
      },
    );

  const discard = () =>
    act(
      "Borrador descartado.",
      () =>
        discardWipAction(section.id, {
          id: page.id,
          expectedLockVersion: lockVersion,
        }),
      (data) => {
        setLockVersion(data.lockVersion);
        setHasWip(false);
        // The form is now showing a document that no longer exists. Reloading
        // is the only honest option: re-deriving the fields here would need the
        // baseline this component was never given.
        window.location.reload();
      },
    );

  const restore = (version: VersionEntry) =>
    act(
      "Versión restaurada en el borrador.",
      () =>
        restoreVersionAction(section.id, {
          id: page.id,
          revisionId: version.revisionId,
          expectedLockVersion: lockVersion,
        }),
      (data) => {
        setLockVersion(data.lockVersion);
        setHasWip(true);
        // Same reason as discard: the editor is holding fields the server has
        // just replaced.
        window.location.reload();
      },
    );

  /** Delete the page. Confirmed in `DeletePanel` by typing the word rather
   * than by a dialog: a dialog is the right weight for a status flip that can
   * be flipped back, and the wrong weight for the one action in the CMS with
   * nothing behind it to restore from. */
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

  // The address the page has (or would have) in public. Read from the *edited*
  // slug rather than the stored one, which is the same value the header shows —
  // and status changes are gated on a clean editor, so the two can't disagree
  // by the time the confirmation quotes it.
  const publicPath = `${publicSectionPath(section.id)}/${(values.slug as string) ?? page.slug}`;

  return (
    <div>
      <header className="mb-7">
        <div className="flex flex-wrap items-center gap-3 mb-2">
          <StatusChip status={status} />
          <span className="font-mono text-micro uppercase tracking-label-wide text-muted">
            {copyState(status, hasWip, state.previewIsStale)}
          </span>
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
            {publicPath}
          </p>
        )}
        {status !== "draft" && (
          <Link
            className="font-mono text-[12px] text-muted mt-2 mb-0 underline hover:text-accent"
            target="_blank"
            rel="noreferrer"
            href={publicPath}
          >
            {publicPath}
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
          Esta página está publicada. Lo que guardas acá es un borrador privado:
          el sitio público sigue mostrando la última versión publicada hasta que
          pulses «Publicar».
        </p>
      )}

      {status === "preview" && state.previewIsStale && (
        <p className="border border-[var(--vendor-ochre)] px-4 py-3 font-mono text-[12px] leading-[1.6] text-ink mb-6">
          La vista previa pública quedó congelada antes de tu último guardado.
          Quien tenga el enlace ve la copia anterior hasta que pulses
          «Actualizar vista previa pública».
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

          {tab === "history" && (
            <HistoryPanel
              section={section.id}
              pageId={page.id}
              versions={versions}
              entries={history}
              busy={busy}
              onRestore={(version) => request({ kind: "restore", version })}
            />
          )}
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
              Validar
            </button>
          </div>

          <StatusControls
            status={status}
            hasWip={hasWip}
            hasPublication={state.publishedRevisionId !== null}
            hasPublicPreview={state.previewRevisionId !== null}
            previewIsStale={state.previewIsStale}
            busy={busy}
            dirty={dirty}
            onPublish={() => request({ kind: "publish" })}
            onPromotePreview={() => request({ kind: "preview" })}
            onUnpublish={() => request({ kind: "unpublish" })}
            onDiscard={() => request({ kind: "discard" })}
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

      {pending && (
        <ActionConfirmDialog
          action={pending}
          status={status}
          hasWip={hasWip}
          previewIsStale={state.previewIsStale}
          publicPath={publicPath}
          busy={busy}
          onConfirm={() => {
            switch (pending.kind) {
              case "publish":
                return void publish();
              case "preview":
                return void promotePreview();
              case "unpublish":
                return void unpublish();
              case "discard":
                return void discard();
              case "restore":
                return void restore(pending.version);
            }
          }}
          onCancel={() => setPending(null)}
        />
      )}
    </div>
  );
}

/** The question in front of every consequential action. Its own component only
 * so the copy table and the dialog stay next to each other. */
function ActionConfirmDialog({
  action,
  status,
  hasWip,
  previewIsStale,
  publicPath,
  busy,
  onConfirm,
  onCancel,
}: {
  action: PendingAction;
  status: ContentStatus;
  hasWip: boolean;
  previewIsStale: boolean;
  publicPath: string;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const copy = actionConfirm(action, {
    status,
    hasWip,
    previewIsStale,
    publicPath,
  });
  return (
    <CmsConfirmDialog
      eyebrow={copy.eyebrow}
      title={copy.title}
      description={copy.description}
      details={copy.details}
      confirmLabel={copy.confirmLabel}
      confirmMark={ACTION_STYLE[action.kind].mark}
      tone={ACTION_STYLE[action.kind].tone}
      busy={busy}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}

function Tabs({ tab, onChange }: { tab: Tab; onChange: (t: Tab) => void }) {
  const items: { id: Tab; label: string }[] = [
    { id: "markdown", label: "Markdown" },
    { id: "preview", label: "Vista previa" },
    { id: "validation", label: "Validación" },
    { id: "history", label: "Historial" },
  ];
  return (
    // Scrolls inside itself rather than pushing the page: four labels in one
    // row do not fit a phone, and a tab strip that widened the document made
    // every screen below it scroll sideways.
    <div
      role="tablist"
      className="flex gap-1 border-b border-line mb-5 overflow-x-auto"
    >
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="tab"
          aria-selected={tab === item.id}
          onClick={() => onChange(item.id)}
          className={cn(
            "shrink-0 px-4 py-2 font-mono text-micro uppercase tracking-label-wide border-b-2 -mb-px transition-colors",
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

function StatusControls({
  status,
  hasWip,
  hasPublication,
  hasPublicPreview,
  previewIsStale,
  busy,
  dirty,
  onPublish,
  onPromotePreview,
  onUnpublish,
  onDiscard,
}: {
  status: ContentStatus;
  hasWip: boolean;
  hasPublication: boolean;
  hasPublicPreview: boolean;
  previewIsStale: boolean;
  busy: boolean;
  dirty: boolean;
  onPublish: () => void;
  onPromotePreview: () => void;
  onUnpublish: () => void;
  onDiscard: () => void;
}) {
  // Publishing needs something to publish: a saved working copy, or — for a
  // page that was taken down — the publication it still holds.
  const canPublish = hasWip || (hasPublication && status !== "published");
  const canPreview = hasWip || hasPublication || hasPublicPreview;

  return (
    <section className="mb-8">
      <h2 className="font-mono text-micro uppercase tracking-label-wide text-accent border-b border-line pb-2 mb-4">
        Publicación
      </h2>
      <div className="flex flex-col gap-2">
        <Action
          mark={ACTION_STYLE.publish.mark}
          fill={ACTION_STYLE.publish.fill}
          disabled={busy || dirty || !canPublish}
          onClick={onPublish}
        >
          {status === "published" ? "Publicar cambios" : "Publicar"}
        </Action>

        {(status !== "preview" || previewIsStale || !hasPublicPreview) && (
          <Action
            mark={ACTION_STYLE.preview.mark}
            fill={ACTION_STYLE.preview.fill}
            disabled={busy || dirty || !canPreview}
            onClick={onPromotePreview}
          >
            {hasPublicPreview && status === "preview"
              ? "Actualizar vista previa pública"
              : "Poner en vista previa pública"}
          </Action>
        )}

        {status !== "draft" && (
          <Action
            mark={ACTION_STYLE.unpublish.mark}
            fill={ACTION_STYLE.unpublish.fill}
            disabled={busy}
            onClick={onUnpublish}
          >
            {status === "published" ? "Despublicar" : "Volver a borrador"}
          </Action>
        )}

        {hasWip && (
          <Action
            mark={ACTION_STYLE.discard.mark}
            fill={ACTION_STYLE.discard.fill}
            disabled={busy}
            onClick={onDiscard}
          >
            Descartar borrador
          </Action>
        )}
      </div>

      {dirty && (
        <p className="font-mono text-[11px] leading-[1.6] text-muted mt-2 mb-0">
          Guarda los cambios: publicar y la vista previa pública trabajan sobre
          lo guardado.
        </p>
      )}
      {!dirty && !canPublish && (
        <p className="font-mono text-[11px] leading-[1.6] text-muted mt-2 mb-0">
          No hay nada nuevo que publicar: guarda un cambio primero.
        </p>
      )}
    </section>
  );
}

/** One lifecycle button. The fill tracks how public the destination is —
 * dashed and quiet for the ones that take a page back, ochre for the shareable
 * preview, solid for the one that puts a page in front of readers — and every
 * one carries the same mark its state does elsewhere, so the button and the
 * chip are recognisably the same vocabulary. */
function Action({
  mark,
  fill,
  disabled,
  onClick,
  children,
}: {
  mark: string;
  /** The button's own colour, from `ACTION_STYLE`. Named `fill` and not `tone`
   * so `DialogTone` keeps that word to itself in this file. */
  fill: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex cursor-pointer items-center gap-2 border px-3 py-2 text-left font-mono text-micro uppercase tracking-label-wide transition-colors disabled:cursor-default disabled:opacity-45",
        fill,
      )}
    >
      <span aria-hidden="true">{mark}</span>
      {children}
    </button>
  );
}

/** Deleting a page, at the bottom of the sidebar and behind two steps.
 *
 * Only a draft can go, and the panel says so rather than hiding: "why is there
 * no delete here" is a worse question than a sentence explaining that a live
 * page is unpublished first. The confirmation is a typed word, not a dialog —
 * every other control here is reversible, this one has no revision history
 * behind it, and a confirmation dismissed by reflex is the same click as the
 * button that opened it. */
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

/** What the confirmation says, per action.
 *
 * It used to be one string handed to `window.confirm`, which meant the most
 * consequential control in the CMS and a stray tab-close warning arrived in the
 * same grey box. Split into parts so the dialog can wear what it is about: the
 * mark and tone of the button that opened it, the page's address spelled out
 * where it changes, and a title that names the action instead of asking
 * «¿Continuar?».
 *
 * Keyed by action rather than by destination status, because two of the five
 * have no destination: discarding the working copy and restoring a version both
 * leave the page exactly as public as it was. That is the thing their dialogs
 * have to say clearly, and a status-shaped table could not say it at all. */
function actionConfirm(
  action: PendingAction,
  context: {
    status: ContentStatus;
    hasWip: boolean;
    previewIsStale: boolean;
    publicPath: string;
  },
): {
  eyebrow: string;
  title: string;
  description: string;
  details: string[];
  confirmLabel: string;
} {
  const { status, hasWip, previewIsStale, publicPath } = context;
  const move = (to: ContentStatus) => `${statusLabel(status)} → ${statusLabel(to)}`;

  switch (action.kind) {
    case "publish":
      return {
        eyebrow: move("published"),
        title:
          status === "published" ? "Publicar los cambios" : "Publicar esta página",
        description:
          status === "published"
            ? "El borrador guardado reemplaza lo que el sitio muestra ahora."
            : "Queda visible para cualquiera y entra en los listados del sitio.",
        details: [
          `Se publica en ${publicPath}`,
          "Aparece en el listado de su sección y en el sitemap.",
          // The cost nobody would guess from the button: publishing spends a
          // retention slot, and the oldest kept version stops being kept.
          "Se guarda como versión nueva; la publicación más antigua deja de guardarse.",
          "El borrador de trabajo desaparece: la próxima edición parte de lo publicado.",
        ],
        confirmLabel: "Publicar",
      };

    case "preview": {
      const refreshing = status === "preview" && previewIsStale;
      return {
        eyebrow: refreshing ? "Vista previa pública" : move("preview"),
        title: refreshing
          ? "Actualizar la vista previa pública"
          : "Poner en vista previa pública",
        description: refreshing
          ? "Quien tenga el enlace pasa a ver el borrador guardado."
          : "Se ve en su dirección para quien tenga el enlace, y en ningún otro lado.",
        details: [
          `Queda accesible en ${publicPath}`,
          "No aparece en listados, ni en el sitemap, ni en buscadores.",
          ...(status === "published"
            ? [
                // The half of this move that surprises people: it takes a live
                // page down. The last publication survives, and saying so is
                // what makes the button clickable without a second thought.
                "La página deja de estar publicada. La última versión publicada se conserva.",
              ]
            : []),
          "El borrador sigue siendo editable: la copia pública no cambia hasta que la actualices.",
        ],
        confirmLabel: refreshing ? "Actualizar" : "Poner en vista previa",
      };
    }

    case "unpublish":
      return {
        eyebrow: move("draft"),
        title: status === "published" ? "Despublicar" : "Volver a borrador",
        description:
          status === "published"
            ? "La página deja de estar publicada."
            : "La página deja de estar accesible por su enlace.",
        details: [
          `${publicPath} pasa a responder 404`,
          status === "published"
            ? "Sale de los listados y del sitemap. El texto no se toca."
            : "El texto no se toca: solo cambia quién puede verlo.",
          "La última versión publicada se conserva, para volver a publicarla en un clic.",
        ],
        confirmLabel: status === "published" ? "Despublicar" : "Volver a borrador",
      };

    case "discard":
      return {
        eyebrow: "Borrador de trabajo",
        title: "Descartar el borrador",
        description:
          "Se pierde todo lo escrito desde la última publicación, y no hay forma de recuperarlo.",
        details: [
          "Se borran el borrador guardado y su copia de seguridad.",
          "La página publicada no cambia: el sitio sigue mostrando lo mismo.",
          "El editor vuelve a partir de la última versión publicada.",
        ],
        confirmLabel: "Descartar",
      };

    case "restore":
      return {
        eyebrow: "Restaurar una versión",
        title: `Restaurar «${action.version.title}»`,
        description:
          "Se copia esa versión al borrador de trabajo. No se publica nada.",
        details: [
          ...(hasWip
            ? [
                "Reemplaza el borrador guardado actual, que queda como copia de seguridad.",
              ]
            : ["Crea el borrador de trabajo a partir de esa versión."]),
          "La página publicada no cambia.",
          "Para que los lectores la vean, hay que publicarla después.",
        ],
        confirmLabel: "Restaurar",
      };
  }
}

/** What the header says about which copies exist, in the words §14.8 asks for.
 * Deliberately about *copies* rather than about status: the chip beside it
 * already says the status, and repeating it would leave the interesting half —
 * "is there work that readers cannot see" — unsaid. */
function copyState(
  status: ContentStatus,
  hasWip: boolean,
  previewIsStale: boolean,
): string {
  if (status === "published") {
    return hasWip
      ? "Publicada · borrador guardado"
      : "Publicada · sin borrador";
  }
  if (status === "preview") {
    return previewIsStale
      ? "Vista previa pública · borrador más reciente disponible"
      : "Vista previa pública";
  }
  return hasWip ? "Borrador · nunca publicada" : "Borrador";
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

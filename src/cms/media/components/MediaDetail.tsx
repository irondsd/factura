"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CmsIcon } from "@/cms/icons";
import { cn } from "@/lib/cn";
import {
  CmsConfirmDialog,
  CmsModal,
  DialogButton,
  DialogCancel,
} from "../../components/CmsDialog";
import { CmsSelect } from "../../components/CmsSelect";
import { inputClass } from "../../components/fields/controls";
import { cmsEditPath } from "../../sections";
import type { ContentSection } from "@/content-system/types";
import {
  cancelReplacementAction,
  completeReplacementAction,
  purgeMediaAction,
  reserveReplacementAction,
  restoreMediaAction,
  trashMediaAction,
  updateMediaAction,
} from "../server/actions";
import type { MediaAsset, MediaCollection, MediaUsageRef } from "../types";
import {
  formatBytes,
  FORMAT_LABEL,
  SUPPORTED_MIME_TYPES,
} from "../validation/upload";
import type { SupportedMimeType } from "../validation/upload";

// One image: the large preview, its editable metadata, where it is used, and
// the only two buttons in the CMS that remove anything.

export function MediaDetail({
  asset: initial,
  usage,
  portraitOf,
  duplicates,
  collections,
  graceDays,
  maxBytes,
}: {
  asset: MediaAsset;
  usage: MediaUsageRef[];
  portraitOf: { id: string; name: string }[];
  duplicates: MediaAsset[];
  collections: MediaCollection[];
  graceDays: number;
  maxBytes: number;
}) {
  const router = useRouter();
  const [asset, setAsset] = useState(initial);
  const [displayName, setDisplayName] = useState(initial.displayName);
  const [defaultAlt, setDefaultAlt] = useState(initial.defaultAlt);
  const [decorative, setDecorative] = useState(initial.decorative);
  const [attribution, setAttribution] = useState(initial.attribution ?? "");
  const [collectionId, setCollectionId] = useState(initial.collectionId ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmingPurge, setConfirmingPurge] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const [replacementBusy, setReplacementBusy] = useState(false);
  const [replacementFile, setReplacementFile] = useState<File | null>(null);
  const [replacementProgress, setReplacementProgress] = useState(0);
  const [replacementError, setReplacementError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const markdown = `![${decorative ? "" : defaultAlt}](${asset.permalink})`;

  const save = () =>
    start(async () => {
      const result = await updateMediaAction({
        id: asset.id,
        expectedLockVersion: asset.lockVersion,
        patch: {
          displayName,
          defaultAlt,
          decorative,
          attribution: attribution.trim() || null,
          collectionId: collectionId || null,
        },
      });
      setMessage(result.ok ? "Guardado." : result.message);
      if (result.ok) setAsset(result.data);
    });

  const trash = () =>
    start(async () => {
      const result = await trashMediaAction({ id: asset.id });
      if (!result.ok) {
        setMessage(result.message);
        return;
      }
      setAsset(result.data);
      setMessage(
        `En la papelera. Sus bytes se conservan ${graceDays} días y puedes restaurarla hasta entonces.`,
      );
    });

  const restore = () =>
    start(async () => {
      const result = await restoreMediaAction({ id: asset.id });
      if (!result.ok) {
        setMessage(result.message);
        return;
      }
      setAsset(result.data);
      setMessage("Restaurada.");
    });

  const purge = () =>
    start(async () => {
      const result = await purgeMediaAction({ id: asset.id });
      if (!result.ok) {
        setConfirmingPurge(false);
        setMessage(result.message);
        return;
      }
      // Stay on the dialog while the router leaves: this component is bound to
      // a row that no longer exists, and re-rendering it as an ordinary page
      // would show an image that is gone.
      router.push("/cms/media");
    });

  const replace = async () => {
    if (!replacementFile) return;
    setReplacementBusy(true);
    setReplacementError(null);
    setReplacementProgress(0);

    const reserved = await reserveReplacementAction({
      mediaId: asset.id,
      expectedLockVersion: asset.lockVersion,
      filename: replacementFile.name,
      contentType: replacementFile.type,
      byteSize: replacementFile.size,
    });
    if (!reserved.ok) {
      setReplacementError(reserved.message);
      setReplacementBusy(false);
      return;
    }
    // Reservation itself participates in optimistic concurrency. Keep this
    // detail screen on the version it just created so a failed upload can be
    // released and retried without forcing a reload.
    setAsset((current) => ({
      ...current,
      lockVersion: reserved.data.lockVersion,
    }));

    try {
      await uploadReplacement(
        reserved.data.uploadUrl,
        replacementFile,
        setReplacementProgress,
      );
      const done = await completeReplacementAction({
        mediaId: asset.id,
        expectedLockVersion: reserved.data.lockVersion,
        filename: replacementFile.name,
      });
      if (!done.ok) throw new Error(done.message);

      setAsset(done.data);
      setReplacementFile(null);
      setReplacing(false);
      setReplacementBusy(false);
      setReplacementProgress(0);
      setMessage(
        "Imagen reemplazada. Las páginas que la usan ya apuntan al archivo nuevo.",
      );
      router.refresh();
    } catch (error) {
      const cancellation = await cancelReplacementAction({ mediaId: asset.id });
      setReplacementError(
        cancellation.ok
          ? error instanceof Error
            ? error.message
            : "No se pudo reemplazar la imagen."
          : `${error instanceof Error ? error.message : "No se pudo reemplazar la imagen."} Tampoco se pudo limpiar la subida: ${cancellation.message}`,
      );
      setReplacementBusy(false);
    }
  };

  return (
    <div className="grid gap-8 md:grid-cols-[minmax(0,1fr)_320px]">
      <div>
        <div className="border border-line bg-card p-3">
          {asset.src ? (
            // A plain <img>, not next/image: this is the CMS's own inspector,
            // and an editor checking a master wants the master, not a resized
            // and re-encoded delivery variant.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={asset.src}
              alt=""
              className="mx-auto max-h-[440px] w-auto"
            />
          ) : (
            <p className="py-16 text-center font-mono text-[13px] text-muted">
              Sin archivo almacenado.
            </p>
          )}
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 font-mono text-[12px]">
          <Fact label="Archivo">{asset.originalFilename}</Fact>
          <Fact label="Formato">
            {asset.mimeType
              ? (FORMAT_LABEL[asset.mimeType as SupportedMimeType] ??
                asset.mimeType)
              : "—"}
          </Fact>
          <Fact label="Dimensiones">
            {asset.width}×{asset.height}
          </Fact>
          <Fact label="Peso">
            {asset.byteSize ? formatBytes(asset.byteSize) : "—"}
          </Fact>
          <Fact label="Subida">{asset.createdAt.slice(0, 10)}</Fact>
          <Fact label="Estado">{statusLabel(asset)}</Fact>
        </dl>

        <div className="mt-5">
          <p className="text-micro uppercase tracking-label-wide text-muted">
            Para pegar en un artículo
          </p>
          <code className="mt-1 block break-all border border-line bg-card px-3 py-2 font-mono text-[12px]">
            {markdown}
          </code>
          <button
            className="mt-1 font-mono text-micro text-muted underline"
            onClick={() => {
              void navigator.clipboard.writeText(markdown);
              setCopied(true);
            }}
          >
            {copied ? "Copiado" : "Copiar Markdown"}
          </button>
          {/* The permalink resolves by id, so the filename in it is decorative
              and a renamed image never breaks an article. */}
          <p className="mt-2 font-mono text-[11px] text-muted">
            El enlace se resuelve por identificador: cambiar el nombre de arriba
            no rompe ninguna página.
          </p>
        </div>

        <section className="mt-6">
          <p className="text-micro uppercase tracking-label-wide text-muted">
            Dónde se usa
          </p>
          {usage.length === 0 ? (
            <p className="mt-2 font-mono text-[13px] text-muted">
              {asset.firstUsedAt
                ? `Ya no se usa en ninguna página. Se usó por última vez el ${(asset.lastReferencedAt ?? "").slice(0, 10)}.`
                : "Todavía no se usa en ninguna página."}
            </p>
          ) : (
            <ul className="mt-2 space-y-1 font-mono text-[13px]">
              {usage.map((reference) => (
                <li key={`${reference.revisionId}-${reference.placement}`}>
                  <Link
                    href={cmsEditPath(
                      reference.section as ContentSection,
                      reference.pageId,
                    )}
                    className="text-ink no-underline hover:text-accent"
                  >
                    {reference.title}
                  </Link>{" "}
                  <span className="text-muted">
                    · {reference.section} · {referenceKindLabel(reference)} ·{" "}
                    {reference.placement === "preview"
                      ? "portada"
                      : `en el cuerpo${reference.occurrences > 1 ? ` (${reference.occurrences}×)` : ""}`}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {portraitOf.length > 0 && (
            /* Not a page reference, so it is not in the list above and no
               amount of editing articles releases it. Said here because it is
               the only place an editor would think to look for why the image
               cannot be removed. */
            <p className="mt-3 font-mono text-[12px] leading-[1.6] text-ink">
              Es el retrato de{" "}
              <strong>
                {portraitOf.map((author) => author.name).join(", ")}
              </strong>
              . Cámbialo en Autores, en la portada del CMS, antes de mover esta
              imagen a la papelera.
            </p>
          )}
          {usage.some(
            (reference) => reference.kind === "published" && !reference.isLive,
          ) && (
            /* The difference an editor needs before they go hunting for the
               page that "still uses" an image they already removed: a retained
               publication is a version nobody is reading, and it releases the
               image on its own once three newer publications push it out. */
            <p className="mt-3 font-mono text-[12px] leading-[1.6] text-muted">
              Las versiones publicadas anteriores también cuentan: la imagen
              queda retenida mientras esas versiones existan, y se libera sola
              cuando publicaciones más nuevas las desplazan.
            </p>
          )}
        </section>

        {duplicates.length > 0 && (
          <p className="mt-4 font-mono text-[12px] text-muted">
            Hay {duplicates.length} imagen(es) con el mismo contenido. No es un
            problema: cada una es un archivo independiente, y borrar una nunca
            afecta a las otras.
          </p>
        )}
      </div>

      <aside className="font-mono text-[13px]">
        {message && (
          <p className="mb-4 border border-line bg-card px-3 py-2 text-[12px]">
            {message}
          </p>
        )}

        <Field label="Nombre">
          <input
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            className={inputClass}
          />
        </Field>

        <Field label="Texto alternativo por defecto">
          <textarea
            value={defaultAlt}
            onChange={(event) => setDefaultAlt(event.target.value)}
            disabled={decorative}
            rows={3}
            className={cn(inputClass, "disabled:opacity-50")}
          />
          <label className="mt-1 flex items-center gap-2 text-[12px] text-muted">
            <input
              type="checkbox"
              checked={decorative}
              onChange={(event) => {
                setDecorative(event.target.checked);
                if (event.target.checked) setDefaultAlt("");
              }}
            />
            Decorativa (no aporta información)
          </label>
          {/* The distinction a screen reader cannot infer: an empty alt is a
              claim, and it has to be made on purpose. */}
          <p className="mt-1 text-[11px] leading-[1.6] text-muted">
            Es una sugerencia: al insertarla puedes cambiar el texto para el
            contexto de esa página. Marcar «decorativa» inserta{" "}
            <code>![]()</code>, que le dice al lector de pantalla que puede
            ignorarla.
          </p>
        </Field>

        <Field label="Colección">
          <CmsSelect
            aria-label="Colección"
            value={collectionId}
            onChange={setCollectionId}
            options={[
              { value: "", label: "Sin colección" },
              ...collections.map((collection) => ({
                value: collection.id,
                label: collection.name,
              })),
            ]}
          />
        </Field>

        <Field label="Crédito (opcional)">
          <input
            value={attribution}
            onChange={(event) => setAttribution(event.target.value)}
            className={inputClass}
          />
        </Field>

        <button
          onClick={save}
          disabled={pending}
          className="mt-2 inline-flex w-full items-center justify-center gap-2 border border-accent px-3 py-2 text-micro uppercase tracking-label-wide text-accent disabled:opacity-50"
        >
          <CmsIcon name="save" size="sm" />
          Guardar
        </button>

        <div className="mt-8 border-t border-line pt-4">
          {asset.status === "ready" ? (
            <>
              <button
                type="button"
                onClick={() => setReplacing(true)}
                disabled={pending}
                className="inline-flex w-full items-center justify-center gap-2 border border-accent px-3 py-2 text-micro uppercase tracking-label-wide text-accent hover:bg-accent hover:text-paper disabled:opacity-50"
              >
                <CmsIcon name="refresh" size="sm" />
                Reemplazar imagen
              </button>
              <p className="mt-2 text-[11px] leading-[1.6] text-muted">
                Conserva el identificador y todas sus apariciones. Al terminar,
                el archivo anterior se elimina del almacenamiento.
              </p>
              <button
                onClick={trash}
                disabled={pending || usage.length > 0 || portraitOf.length > 0}
                className="mt-4 inline-flex w-full items-center justify-center gap-2 border border-line px-3 py-2 text-micro uppercase tracking-label-wide text-muted hover:border-accent hover:text-accent disabled:opacity-40"
              >
                <CmsIcon name="delete" size="sm" />
                Mover a la papelera
              </button>
              <p className="mt-2 text-[11px] leading-[1.6] text-muted">
                {usage.length > 0
                  ? "No se puede: hay versiones guardadas que la usan. Quítala de ahí primero."
                  : portraitOf.length > 0
                    ? "No se puede: es el retrato de un autor. Cámbialo en Autores primero."
                    : `Reversible durante ${graceDays} días. Nada se borra al quitar una imagen de una página.`}
              </p>
            </>
          ) : asset.status === "trashed" || asset.status === "purging" ? (
            <>
              <button
                onClick={restore}
                disabled={pending}
                className="inline-flex w-full items-center justify-center gap-2 border border-accent px-3 py-2 text-micro uppercase tracking-label-wide text-accent disabled:opacity-50"
              >
                <CmsIcon name="restore" size="sm" />
                Restaurar
              </button>
              <button
                onClick={() => setConfirmingPurge(true)}
                disabled={pending}
                className="mt-2 inline-flex w-full items-center justify-center gap-2 border border-line px-3 py-2 text-micro uppercase tracking-label-wide text-muted hover:border-[var(--vendor-ochre)] hover:text-[var(--vendor-ochre)] disabled:opacity-50"
              >
                <CmsIcon name="delete" size="sm" />
                Eliminar definitivamente
              </button>
              <p className="mt-2 text-[11px] leading-[1.6] text-muted">
                Borra el archivo del almacenamiento. Antes de hacerlo se vuelve
                a comprobar que ninguna página la use.
              </p>
            </>
          ) : (
            <p className="text-[12px] text-muted">
              Eliminada el {(asset.trashedAt ?? asset.updatedAt).slice(0, 10)}.
              Queda el registro para que el enlace responda «410 Gone» en vez de
              un 404.
            </p>
          )}
        </div>
      </aside>

      {confirmingPurge && (
        <CmsConfirmDialog
          eyebrow={asset.displayName}
          title="Eliminar definitivamente"
          description="La única acción del CMS que borra bytes. No hay papelera detrás de esta."
          details={[
            "Se borra el archivo del almacenamiento y no se puede deshacer.",
            "Antes de borrarlo se vuelve a comprobar que ninguna página lo use.",
            "El registro queda, para que el enlace responda «410 Gone» en vez de un 404.",
          ]}
          confirmLabel="Eliminar"
          confirmIcon="delete"
          busy={pending}
          onConfirm={purge}
          onCancel={() => setConfirmingPurge(false)}
        />
      )}

      {replacing && (
        <CmsModal
          eyebrow={asset.displayName}
          title="Reemplazar imagen"
          busy={replacementBusy}
          onClose={() => {
            setReplacing(false);
            setReplacementFile(null);
            setReplacementError(null);
            setReplacementProgress(0);
          }}
        >
          <p className="mt-3 font-mono text-[12px] leading-[1.7] text-muted">
            La imagen nueva aparecerá automáticamente en las páginas que usan
            este medio. El nombre, el texto alternativo, el crédito y la
            colección se conservan. El archivo anterior se borra y no puede
            recuperarse.
          </p>
          <label className="mt-5 block font-mono text-micro uppercase tracking-label-wide text-muted">
            Archivo nuevo
            <input
              type="file"
              accept={SUPPORTED_MIME_TYPES.join(",")}
              disabled={replacementBusy}
              onChange={(event) => {
                setReplacementFile(event.target.files?.[0] ?? null);
                setReplacementError(null);
              }}
              className="mt-2 block w-full border border-line bg-card px-3 py-2 text-[12px] normal-case tracking-normal file:mr-3 file:border-0 file:bg-transparent file:font-mono file:text-micro file:uppercase file:tracking-label-wide file:text-accent"
            />
          </label>
          <p className="mt-2 font-mono text-[11px] leading-[1.6] text-muted">
            JPEG, PNG, WebP, AVIF o GIF · máximo {formatBytes(maxBytes)}.
          </p>

          {replacementProgress > 0 && (
            <div className="mt-4" aria-live="polite">
              <div className="h-1.5 overflow-hidden bg-line">
                <div
                  className="h-full bg-accent transition-[width]"
                  style={{ width: `${Math.round(replacementProgress * 100)}%` }}
                />
              </div>
              <p className="mt-2 font-mono text-[11px] text-muted">
                {replacementProgress < 1
                  ? `Subiendo… ${Math.round(replacementProgress * 100)}%`
                  : "Procesando y reemplazando…"}
              </p>
            </div>
          )}

          {replacementError && (
            <p
              role="alert"
              className="mt-4 border border-[var(--vendor-ochre)] px-3 py-2 font-mono text-[12px] text-[var(--vendor-ochre)]"
            >
              {replacementError}
            </p>
          )}

          <div className="mt-6 flex items-center gap-2">
            <DialogButton
              tone="accent"
              icon="refresh"
              disabled={!replacementFile || replacementBusy}
              onClick={() => void replace()}
            >
              Reemplazar
            </DialogButton>
            <DialogCancel
              disabled={replacementBusy}
              onClick={() => {
                setReplacing(false);
                setReplacementFile(null);
                setReplacementError(null);
              }}
            />
          </div>
        </CmsModal>
      )}
    </div>
  );
}

function uploadReplacement(
  uploadUrl: string,
  file: File,
  onProgress: (progress: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", uploadUrl);
    request.setRequestHeader("Content-Type", file.type);
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    request.onload = () =>
      request.status >= 200 && request.status < 300
        ? resolve()
        : reject(new Error(`El almacenamiento respondió ${request.status}.`));
    request.onerror = () =>
      reject(new Error("No se pudo conectar con el almacenamiento."));
    request.send(file);
  });
}

function statusLabel(asset: MediaAsset): string {
  switch (asset.status) {
    case "ready":
      return "en la biblioteca";
    case "pending":
      return "subida sin terminar";
    case "trashed":
      return "en la papelera";
    case "purging":
      return "eliminándose";
    case "purged":
      return "eliminada";
  }
}

function Fact({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-micro uppercase tracking-label-wide text-muted">
        {label}
      </dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-4">
      <p className="mb-1 text-micro uppercase tracking-label-wide text-muted">
        {label}
      </p>
      {children}
    </div>
  );
}

/** How a reference is described in the usage list. The kind matters here in a
 * way it does not anywhere else: "the live article uses this" and "a retained
 * publication from March uses this" are the same row in the table and very
 * different answers to «¿por qué no puedo borrarla?». */
function referenceKindLabel(reference: MediaUsageRef): string {
  switch (reference.kind) {
    case "wip":
      return "borrador de trabajo";
    case "checkpoint":
      return "copia de seguridad del borrador";
    case "preview":
      return "vista previa pública";
    case "published":
      return reference.isLive
        ? "versión en línea"
        : `publicación anterior ${reference.publicationNumber ?? ""}`.trim();
  }
}

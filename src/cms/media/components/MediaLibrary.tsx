"use client";

import Link from "next/link";
import { useCallback, useMemo, useRef, useState, useTransition } from "react";
import { CmsConfirmDialog, CmsPromptDialog } from "../../components/CmsDialog";
import {
  createCollectionAction,
  deleteCollectionAction,
  listMediaAction,
  mediaCountsAction,
  reconcileAction,
  reserveUploadAction,
  completeUploadAction,
} from "../server/actions";
import type {
  MediaAssetWithUsage,
  MediaCollection,
  MediaListFilter,
  MediaUsageFilter,
} from "../types";
import {
  formatBytes,
  MAX_BATCH_FILES,
  SUPPORTED_MIME_TYPES,
} from "../validation/upload";

// The media library screen.
//
// One client component because the whole thing is one interaction: dropping
// files updates the grid, filtering updates the grid, and a collection is a
// filter. The server component above it does the first read so the page is
// useful before any JavaScript runs.

type View =
  | { kind: "collection"; id: string | null }
  | { kind: "usage"; usage: MediaUsageFilter }
  | { kind: "trash" };

type Counts = {
  all: number;
  used: number;
  neverUsed: number;
  noLongerUsed: number;
  trashed: number;
  uncollected: number;
};

/** One file's journey, so a failure names the file that failed and the rest of
 * the batch carries on. */
type Upload = {
  key: string;
  name: string;
  progress: number;
  state: "uploading" | "finalizing" | "done" | "error";
  message?: string;
  file: File;
};

const ACCEPT = SUPPORTED_MIME_TYPES.join(",");

export function MediaLibrary({
  initial,
  collections: initialCollections,
  counts: initialCounts,
  graceDays,
  maxBytes,
}: {
  initial: MediaAssetWithUsage[];
  collections: (MediaCollection & { count: number })[];
  counts: Counts;
  graceDays: number;
  maxBytes: number;
}) {
  const [assets, setAssets] = useState(initial);
  const [collections, setCollections] = useState(initialCollections);
  const [counts, setCounts] = useState(initialCounts);
  const [view, setView] = useState<View>({ kind: "usage", usage: "all" });
  const [search, setSearch] = useState("");
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [dragging, setDragging] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  // The two dialogs this screen raises. `naming` is a boolean because there is
  // only ever one new collection being named; `removing` holds the collection
  // itself, so the question can say which one it is about.
  const [naming, setNaming] = useState(false);
  const [collectionError, setCollectionError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<
    (MediaCollection & { count: number }) | null
  >(null);
  const [pending, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);

  const filter = useMemo<MediaListFilter>(() => {
    const base: MediaListFilter = { search: search || undefined };
    if (view.kind === "trash") return { ...base, statuses: ["trashed"] };
    if (view.kind === "usage") return { ...base, usage: view.usage };
    return { ...base, collectionId: view.id };
  }, [view, search]);

  const refresh = useCallback(
    (next: MediaListFilter = filter) =>
      start(async () => {
        const [rows, totals] = await Promise.all([
          listMediaAction(next),
          mediaCountsAction(),
        ]);
        setAssets(rows);
        setCounts(totals);
      }),
    [filter],
  );

  const show = (next: View) => {
    setView(next);
    const base: MediaListFilter = { search: search || undefined };
    refresh(
      next.kind === "trash"
        ? { ...base, statuses: ["trashed"] }
        : next.kind === "usage"
          ? { ...base, usage: next.usage }
          : { ...base, collectionId: next.id },
    );
  };

  /** Upload one file: reserve, PUT the bytes straight to object storage, then
   * finalize. `XMLHttpRequest` rather than `fetch` for the one reason it still
   * wins — it reports upload progress, and a 20 MB image with no progress bar
   * looks like a hung page. */
  const uploadOne = useCallback(
    async (file: File, key: string) => {
      const patch = (next: Partial<Upload>) =>
        setUploads((items) =>
          items.map((item) => (item.key === key ? { ...item, ...next } : item)),
        );

      const reserved = await reserveUploadAction({
        filename: file.name,
        contentType: file.type,
        byteSize: file.size,
        collectionId: view.kind === "collection" ? view.id : null,
      });
      if (!reserved.ok) {
        patch({ state: "error", message: reserved.message });
        return;
      }

      try {
        await new Promise<void>((resolve, reject) => {
          const request = new XMLHttpRequest();
          request.open("PUT", reserved.data.uploadUrl);
          request.setRequestHeader("Content-Type", file.type);
          request.upload.onprogress = (event) => {
            if (event.lengthComputable) {
              patch({ progress: event.loaded / event.total });
            }
          };
          request.onload = () =>
            request.status >= 200 && request.status < 300
              ? resolve()
              : reject(
                  new Error(`El almacenamiento respondió ${request.status}.`),
                );
          request.onerror = () =>
            reject(new Error("No se pudo conectar con el almacenamiento."));
          request.send(file);
        });
      } catch (error) {
        patch({
          state: "error",
          message: error instanceof Error ? error.message : "Falló la subida.",
        });
        return;
      }

      patch({ state: "finalizing", progress: 1 });
      try {
        const done = await completeUploadAction({
          mediaId: reserved.data.mediaId,
        });
        patch(
          done.ok
            ? { state: "done" }
            : { state: "error", message: done.message },
        );
      } catch (error) {
        // A *rejected* action — a 500 rather than a returned failure — must
        // still land on this row. Without it the row sits on «procesando…»
        // forever and the batch looks stuck rather than failed.
        patch({
          state: "error",
          message:
            error instanceof Error
              ? error.message
              : "El servidor no pudo procesar la imagen.",
        });
      }
    },
    [view],
  );

  const accept = useCallback(
    (files: FileList | null) => {
      if (!files?.length) return;
      const batch = [...files].slice(0, MAX_BATCH_FILES);
      if (files.length > MAX_BATCH_FILES) {
        setNotice(
          `Se suben ${MAX_BATCH_FILES} archivos por vez; el resto quedó fuera.`,
        );
      }
      const queued: Upload[] = batch.map((file, index) => ({
        key: `${Date.now()}-${index}-${file.name}`,
        name: file.name,
        progress: 0,
        state: "uploading",
        file,
      }));
      setUploads((items) => [...queued, ...items]);
      // Sequential on purpose: two trusted editors, and a serial queue keeps
      // the progress list readable and the rate limit far away. One file
      // failing must not abandon the rest of the batch, so each is contained.
      void (async () => {
        for (const item of queued) {
          try {
            await uploadOne(item.file, item.key);
          } catch (error) {
            setUploads((rows) =>
              rows.map((row) =>
                row.key === item.key
                  ? {
                      ...row,
                      state: "error" as const,
                      message:
                        error instanceof Error
                          ? error.message
                          : "Falló la subida.",
                    }
                  : row,
              ),
            );
          }
        }
        refresh();
      })();
    },
    [uploadOne, refresh],
  );

  /** A rejected name — taken, too long — belongs under the field that produced
   * it, with the typed text still there to fix. That is the whole reason the
   * naming dialog holds its own error instead of routing through `notice`
   * like every other failure on this screen. */
  const createCollection = (name: string) => {
    setCollectionError(null);
    start(async () => {
      const result = await createCollectionAction({ name });
      if (!result.ok) {
        setCollectionError(result.message);
        return;
      }
      setCollections((items) => [...items, { ...result.data, count: 0 }]);
      setNaming(false);
    });
  };

  const removeCollection = (collection: MediaCollection) => {
    start(async () => {
      const result = await deleteCollectionAction({ id: collection.id });
      setRemoving(null);
      if (!result.ok) {
        setNotice(result.message);
        return;
      }
      setCollections((items) =>
        items.filter((item) => item.id !== collection.id),
      );
      if (view.kind === "collection" && view.id === collection.id) {
        show({ kind: "usage", usage: "all" });
      }
    });
  };

  const reconcile = () =>
    start(async () => {
      const result = await reconcileAction();
      if (!result.ok) {
        setNotice(result.message);
        return;
      }
      const { usage, bucket } = result.data;
      setNotice(
        `${usage.revisionsScanned} versiones revisadas, ${usage.referencesFound} referencias. ` +
          `Bucket: ${bucket.objects} objetos, ${bucket.orphanedObjects.length} huérfanos, ` +
          `${bucket.missingObjects.length} filas sin archivo.`,
      );
      refresh();
    });

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(event) => {
        if (event.currentTarget === event.target) setDragging(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        accept(event.dataTransfer.files);
      }}
      className="relative grid gap-8 md:grid-cols-[190px_1fr]"
    >
      {dragging && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center border-2 border-dashed border-accent bg-paper/90">
          <p className="font-mono text-[14px] text-accent">
            Suelta las imágenes para subirlas
          </p>
        </div>
      )}

      <aside className="font-mono text-[13px]">
        <Group label="Biblioteca">
          <Item
            active={view.kind === "usage" && view.usage === "all"}
            onClick={() => show({ kind: "usage", usage: "all" })}
            count={counts.all}
          >
            Todas
          </Item>
          <Item
            active={view.kind === "usage" && view.usage === "used"}
            onClick={() => show({ kind: "usage", usage: "used" })}
            count={counts.used}
          >
            En uso
          </Item>
          {/* The two halves of "unused". An image uploaded five minutes ago and
              one dropped from a guide last month both have zero references, and
              only the second is obviously safe to remove. */}
          <Item
            active={view.kind === "usage" && view.usage === "never-used"}
            onClick={() => show({ kind: "usage", usage: "never-used" })}
            count={counts.neverUsed}
          >
            Nunca usadas
          </Item>
          <Item
            active={view.kind === "usage" && view.usage === "no-longer-used"}
            onClick={() => show({ kind: "usage", usage: "no-longer-used" })}
            count={counts.noLongerUsed}
          >
            Ya no se usan
          </Item>
          <Item
            active={view.kind === "trash"}
            onClick={() => show({ kind: "trash" })}
            count={counts.trashed}
          >
            Papelera
          </Item>
        </Group>

        <Group label="Colecciones">
          <Item
            active={view.kind === "collection" && view.id === null}
            onClick={() => show({ kind: "collection", id: null })}
            count={counts.uncollected}
          >
            Sin colección
          </Item>
          {collections.map((collection) => (
            <Item
              key={collection.id}
              active={view.kind === "collection" && view.id === collection.id}
              onClick={() => show({ kind: "collection", id: collection.id })}
              onRemove={() => setRemoving(collection)}
              count={collection.count}
            >
              {collection.name}
            </Item>
          ))}
          <button
            onClick={() => {
              setCollectionError(null);
              setNaming(true);
            }}
            className="mt-1 block w-full text-left text-micro uppercase tracking-label-wide text-muted hover:text-accent"
          >
            + Nueva colección
          </button>
        </Group>

        <button
          onClick={reconcile}
          disabled={pending}
          className="mt-6 block w-full border border-line px-2 py-1.5 text-micro uppercase tracking-label-wide text-muted hover:border-accent hover:text-accent disabled:opacity-50"
          title="Vuelve a derivar el uso desde las páginas y compara el bucket con el catálogo"
        >
          Recalcular
        </button>
      </aside>

      <section>
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && refresh()}
            onBlur={() => refresh()}
            placeholder="Buscar por nombre, archivo o texto alternativo"
            className="min-w-[240px] flex-1 border border-line bg-card px-3 py-2 font-mono text-[13px]"
          />
          <button
            onClick={() => input.current?.click()}
            className="border border-accent px-3 py-2 font-mono text-micro uppercase tracking-label-wide text-accent"
          >
            Seleccionar imágenes
          </button>
          <input
            ref={input}
            type="file"
            multiple
            accept={ACCEPT}
            className="hidden"
            onChange={(event) => {
              accept(event.target.files);
              event.target.value = "";
            }}
          />
        </div>

        {notice && (
          <p className="mb-4 border border-line bg-card px-3 py-2 font-mono text-[12px] text-muted">
            {notice}{" "}
            <button className="underline" onClick={() => setNotice(null)}>
              cerrar
            </button>
          </p>
        )}

        {uploads.length > 0 && (
          <ul className="mb-5 space-y-1.5">
            {uploads.map((upload) => (
              <li
                key={upload.key}
                className="flex items-center gap-3 border border-line px-3 py-2 font-mono text-[12px]"
              >
                <span className="flex-1 truncate">{upload.name}</span>
                {upload.state === "error" ? (
                  <span className="text-[var(--vendor-ochre)]">
                    {upload.message}
                  </span>
                ) : upload.state === "done" ? (
                  <span className="text-muted">listo</span>
                ) : (
                  <span className="text-muted">
                    {upload.state === "finalizing"
                      ? "procesando…"
                      : `${Math.round(upload.progress * 100)}%`}
                  </span>
                )}
                <button
                  className="text-muted underline"
                  onClick={() =>
                    setUploads((items) =>
                      items.filter((item) => item.key !== upload.key),
                    )
                  }
                >
                  quitar
                </button>
              </li>
            ))}
          </ul>
        )}

        {view.kind === "trash" && (
          <p className="mb-4 border border-line border-dashed px-3 py-2 font-mono text-[12px] text-muted">
            Los archivos en la papelera conservan sus bytes {graceDays} días y
            pueden restaurarse en cualquier momento. Nada se borra al quitar una
            imagen de una página: eso solo actualiza dónde se usa.
          </p>
        )}

        {assets.length === 0 ? (
          <p className="border border-dashed border-line px-5 py-12 text-center font-mono text-[14px] text-muted">
            {emptyMessage(view)} Arrastra imágenes aquí para subirlas (máximo{" "}
            {formatBytes(maxBytes)} cada una).
          </p>
        ) : (
          <ul className="grid grid-cols-2 gap-4 lg:grid-cols-3">
            {assets.map((asset) => (
              <li key={asset.id} className="border border-line bg-card">
                <Link
                  href={`/cms/media/${asset.id}`}
                  className="block no-underline text-ink"
                >
                  <span className="flex aspect-[16/9] items-center justify-center overflow-hidden bg-paper">
                    {asset.src ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={asset.src}
                        alt=""
                        className="h-full w-full object-contain"
                      />
                    ) : (
                      <span className="font-mono text-[12px] text-muted">
                        sin archivo
                      </span>
                    )}
                  </span>
                  <span className="block px-3 py-2 font-mono text-[12px]">
                    <span className="block truncate">{asset.displayName}</span>
                    <span className="mt-0.5 block text-muted">
                      {asset.width}×{asset.height} ·{" "}
                      {asset.byteSize ? formatBytes(asset.byteSize) : "—"}
                    </span>
                    <span className="mt-0.5 block text-muted">
                      {usageLabel(asset)}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {naming && (
        <CmsPromptDialog
          eyebrow="Colecciones"
          title="Nueva colección"
          description="Una carpeta para agrupar imágenes. No cambia dónde se usan ni cómo se entregan: solo es otra forma de encontrarlas."
          label="Nombre"
          placeholder="Portadas de guías"
          confirmLabel="Crear"
          busy={pending}
          error={collectionError}
          onSubmit={createCollection}
          onCancel={() => {
            setNaming(false);
            setCollectionError(null);
          }}
        />
      )}

      {removing && (
        <CmsConfirmDialog
          eyebrow="Colecciones"
          title={`Eliminar «${removing.name}»`}
          description="Se elimina la colección, no las imágenes."
          details={[
            // A count of zero gets no line at all: "sus 0 imágenes vuelven a
            // Sin colección" is a sentence about nothing.
            removing.count === 0
              ? null
              : removing.count === 1
                ? "La imagen que contiene vuelve a «Sin colección»."
                : `Sus ${removing.count} imágenes vuelven a «Sin colección».`,
            "Ninguna página cambia: una colección no interviene en dónde se usa una imagen.",
          ].filter((line): line is string => line !== null)}
          confirmLabel="Eliminar"
          busy={pending}
          onConfirm={() => removeCollection(removing)}
          onCancel={() => setRemoving(null)}
        />
      )}
    </div>
  );
}

function usageLabel(asset: MediaAssetWithUsage): string {
  if (asset.status === "trashed") {
    return asset.trashedAt
      ? `en papelera desde ${asset.trashedAt.slice(0, 10)}`
      : "en papelera";
  }
  if (asset.usageCount > 0) {
    return `usada en ${asset.usageCount} página${asset.usageCount === 1 ? "" : "s"}`;
  }
  return asset.lastReferencedAt
    ? `sin uso desde ${asset.lastReferencedAt.slice(0, 10)}`
    : "nunca usada";
}

function emptyMessage(view: View): string {
  if (view.kind === "trash") return "La papelera está vacía.";
  if (view.kind === "usage" && view.usage === "never-used") {
    return "Todas las imágenes se usaron alguna vez.";
  }
  if (view.kind === "usage" && view.usage === "no-longer-used") {
    return "Ninguna imagen quedó sin uso.";
  }
  return "No hay imágenes todavía.";
}

function Group({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-5">
      <p className="mb-2 text-micro uppercase tracking-label-wide text-muted">
        {label}
      </p>
      <ul className="space-y-0.5">{children}</ul>
    </div>
  );
}

function Item({
  active,
  onClick,
  onRemove,
  count,
  children,
}: {
  active: boolean;
  onClick: () => void;
  onRemove?: () => void;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <li className="group flex items-center gap-1">
      <button
        onClick={onClick}
        className={`flex-1 truncate text-left ${active ? "text-accent" : "text-ink hover:text-accent"}`}
      >
        {children}
      </button>
      <span className="text-muted">{count}</span>
      {onRemove && (
        <button
          onClick={onRemove}
          aria-label="Eliminar colección"
          className="hidden text-muted hover:text-accent group-hover:block"
        >
          ×
        </button>
      )}
    </li>
  );
}

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { cmsEditPath } from "../../sections";
import type { ContentSection } from "@/content-system/types";
import {
  purgeMediaAction,
  restoreMediaAction,
  trashMediaAction,
  updateMediaAction,
} from "../server/actions";
import type { MediaAsset, MediaCollection, MediaUsageRef } from "../types";
import { formatBytes, FORMAT_LABEL } from "../validation/upload";
import type { SupportedMimeType } from "../validation/upload";

// One image: the large preview, its editable metadata, where it is used, and
// the only two buttons in the CMS that remove anything.

export function MediaDetail({
  asset: initial,
  usage,
  duplicates,
  collections,
  graceDays,
}: {
  asset: MediaAsset;
  usage: MediaUsageRef[];
  duplicates: MediaAsset[];
  collections: MediaCollection[];
  graceDays: number;
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
      if (
        !window.confirm(
          "Se borra el archivo del almacenamiento y no se puede deshacer. ¿Eliminar definitivamente?",
        )
      ) {
        return;
      }
      const result = await purgeMediaAction({ id: asset.id });
      if (!result.ok) {
        setMessage(result.message);
        return;
      }
      router.push("/cms/media");
    });

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
                <li key={`${reference.pageId}-${reference.placement}`}>
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
                    · {reference.section} ·{" "}
                    {reference.placement === "preview"
                      ? "portada"
                      : `en el cuerpo${reference.occurrences > 1 ? ` (${reference.occurrences}×)` : ""}`}
                    {reference.status !== "published" &&
                      ` · ${reference.status}`}
                  </span>
                </li>
              ))}
            </ul>
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
            className="w-full border border-line bg-card px-2 py-1.5"
          />
        </Field>

        <Field label="Texto alternativo por defecto">
          <textarea
            value={defaultAlt}
            onChange={(event) => setDefaultAlt(event.target.value)}
            disabled={decorative}
            rows={3}
            className="w-full border border-line bg-card px-2 py-1.5 disabled:opacity-50"
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
          <select
            value={collectionId}
            onChange={(event) => setCollectionId(event.target.value)}
            className="w-full border border-line bg-card px-2 py-1.5"
          >
            <option value="">Sin colección</option>
            {collections.map((collection) => (
              <option key={collection.id} value={collection.id}>
                {collection.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Crédito (opcional)">
          <input
            value={attribution}
            onChange={(event) => setAttribution(event.target.value)}
            className="w-full border border-line bg-card px-2 py-1.5"
          />
        </Field>

        <button
          onClick={save}
          disabled={pending}
          className="mt-2 w-full border border-accent px-3 py-2 text-micro uppercase tracking-label-wide text-accent disabled:opacity-50"
        >
          Guardar
        </button>

        <div className="mt-8 border-t border-line pt-4">
          {asset.status === "ready" ? (
            <>
              <button
                onClick={trash}
                disabled={pending || usage.length > 0}
                className="w-full border border-line px-3 py-2 text-micro uppercase tracking-label-wide text-muted hover:border-accent hover:text-accent disabled:opacity-40"
              >
                Mover a la papelera
              </button>
              <p className="mt-2 text-[11px] leading-[1.6] text-muted">
                {usage.length > 0
                  ? "No se puede: hay páginas que la usan. Quítala de ahí primero."
                  : `Reversible durante ${graceDays} días. Nada se borra al quitar una imagen de una página.`}
              </p>
            </>
          ) : asset.status === "trashed" || asset.status === "purging" ? (
            <>
              <button
                onClick={restore}
                disabled={pending}
                className="w-full border border-accent px-3 py-2 text-micro uppercase tracking-label-wide text-accent disabled:opacity-50"
              >
                Restaurar
              </button>
              <button
                onClick={purge}
                disabled={pending}
                className="mt-2 w-full border border-line px-3 py-2 text-micro uppercase tracking-label-wide text-muted hover:border-[var(--vendor-ochre)] hover:text-[var(--vendor-ochre)] disabled:opacity-50"
              >
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
    </div>
  );
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

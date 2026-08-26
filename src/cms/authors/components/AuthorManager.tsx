"use client";

import { useState, useTransition } from "react";
import { slugifyCategory as slugify } from "@/content-system/categories/slug";
import { cn } from "@/lib/cn";
import {
  CmsModal,
  DialogButton,
  DialogCancel,
} from "@/cms/components/CmsDialog";
import { MediaPicker } from "@/cms/media/components/MediaPicker";
import {
  createAuthorAction,
  listAuthorsAction,
  updateAuthorAction,
} from "../server/actions";
import type { ContentAuthorWithUsage } from "../server/service";

// The whole authors UI, and deliberately the only one: a modal on the CMS home
// rather than a section in the navigation.
//
// Two people who change about once a year do not need a screen of their own, and
// putting one in the nav would give the list the same weight as Guías. Same
// shape as `CategoryManager` for the same reason — an editor learns one dialog
// and it behaves the same way twice.
//
// There is no delete. That is the house rule everywhere in this CMS, and here it
// is also a schema fact: `cms_author` has no `retired_at`, so a name in this
// list is permanent until one is added.

type View =
  | { kind: "list" }
  | { kind: "create" }
  | { kind: "edit"; author: ContentAuthorWithUsage };

export function AuthorManager({
  initialAuthors,
}: {
  initialAuthors: ContentAuthorWithUsage[];
}) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>({ kind: "list" });
  const [authors, setAuthors] = useState(initialAuthors);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const close = () => {
    if (pending) return;
    setOpen(false);
    setView({ kind: "list" });
    setError(null);
  };

  const run = (
    work: () => Promise<{ ok: boolean; message?: string }>,
    success: string,
  ) => {
    setError(null);
    startTransition(async () => {
      try {
        const result = await work();
        if (!result.ok) {
          setError(result.message ?? "No se pudo guardar el cambio.");
          return;
        }
        setAuthors(await listAuthorsAction());
        setNotice(success);
        setView({ kind: "list" });
      } catch {
        setError(
          "No se pudo guardar el cambio. Vuelve a intentarlo; si sigue fallando, avisa.",
        );
      }
    });
  };

  const title =
    view.kind === "list"
      ? "Autores del sitio"
      : view.kind === "create"
        ? "Nuevo autor"
        : "Editar autor";

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setNotice(null);
          setError(null);
          setView({ kind: "list" });
          setOpen(true);
        }}
        className="inline-flex cursor-pointer items-center gap-2 border border-line bg-paper px-4 py-2 font-mono text-micro tracking-label-wide text-ink uppercase transition-colors hover:border-accent hover:text-accent"
      >
        Autores
      </button>

      {open && (
        <CmsModal
          eyebrow="Personas"
          title={title}
          busy={pending}
          onClose={close}
          width="780px"
        >
          {view.kind === "list" ? (
            <AuthorList
              authors={authors}
              notice={notice}
              onCreate={() => {
                setError(null);
                setView({ kind: "create" });
              }}
              onEdit={(author) => {
                setError(null);
                setView({ kind: "edit", author });
              }}
              onClose={close}
            />
          ) : view.kind === "create" ? (
            <AuthorForm
              mode="create"
              busy={pending}
              error={error}
              onCancel={() => setView({ kind: "list" })}
              onSubmit={(values) =>
                run(() => createAuthorAction(values), "Autor creado.")
              }
            />
          ) : (
            <AuthorForm
              mode="edit"
              author={view.author}
              busy={pending}
              error={error}
              onCancel={() => setView({ kind: "list" })}
              onSubmit={(values) =>
                run(
                  () =>
                    updateAuthorAction({
                      id: view.author.id,
                      patch: values,
                    }),
                  "Autor actualizado.",
                )
              }
            />
          )}
        </CmsModal>
      )}
    </>
  );
}

function AuthorList({
  authors,
  notice,
  onCreate,
  onEdit,
  onClose,
}: {
  authors: ContentAuthorWithUsage[];
  notice: string | null;
  onCreate: () => void;
  onEdit: (author: ContentAuthorWithUsage) => void;
  onClose: () => void;
}) {
  return (
    <div className="mt-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="m-0 max-w-[58ch] font-mono text-[13px] leading-[1.6] text-muted">
          Quién puede firmar o verificar una página. Todavía no se muestran en
          el sitio: por ahora sólo viajan en los datos estructurados de cada
          artículo. No se pueden eliminar.
        </p>
        <DialogButton tone="accent" icon="add" onClick={onCreate}>
          Nuevo
        </DialogButton>
      </div>

      {notice && (
        <p
          role="status"
          className="mt-4 mb-0 border-l-2 border-ok py-2 pl-4 font-mono text-[13px] text-ink"
        >
          {notice}
        </p>
      )}

      {authors.length === 0 ? (
        <p className="mt-7 mb-0 border-y border-line py-6 font-mono text-[13px] text-muted">
          Todavía no hay autores.
        </p>
      ) : (
        <ul className="mt-6 mb-0 list-none border-t border-line p-0">
          {authors.map((author) => (
            <li key={author.id} className="border-b border-line py-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="m-0 text-[15px] font-semibold text-ink">
                    {author.name}
                  </p>
                  {author.jobTitle && (
                    <p className="mt-1 mb-0 font-mono text-[12px] text-ink/70">
                      {author.jobTitle}
                    </p>
                  )}
                  <p className="mt-1 mb-0 break-all font-mono text-[12px] text-muted">
                    {author.slug ? `/autores/${author.slug}` : "Sin dirección"}
                    <span className="ml-3 whitespace-nowrap">
                      {author.usageCount}{" "}
                      {author.usageCount === 1 ? "página" : "páginas"}
                    </span>
                  </p>
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-2">
                  <RowButton onClick={() => onEdit(author)}>Editar</RowButton>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-6 flex">
        <DialogCancel onClick={onClose}>Cerrar</DialogCancel>
      </div>
    </div>
  );
}

type FormValues = {
  name: string;
  tagline: string | null;
  jobTitle: string | null;
  imageMediaId: string | null;
  slug: string | null;
  about: string | null;
};

function AuthorForm({
  mode,
  author,
  busy,
  error,
  onCancel,
  onSubmit,
}: {
  mode: "create" | "edit";
  author?: ContentAuthorWithUsage;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (values: FormValues) => void;
}) {
  const [name, setName] = useState(author?.name ?? "");
  const [tagline, setTagline] = useState(author?.tagline ?? "");
  const [jobTitle, setJobTitle] = useState(author?.jobTitle ?? "");
  const [about, setAbout] = useState(author?.about ?? "");
  const [imageMediaId, setImageMediaId] = useState(
    author?.imageMediaId ?? null,
  );
  const [slug, setSlug] = useState(author?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(false);

  return (
    <form
      className="mt-5"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit({
          name,
          // Blank means "not set": the service normalizes empty to null, so
          // clearing a box in the browser clears the column.
          tagline: tagline.trim() || null,
          jobTitle: jobTitle.trim() || null,
          about: about.trim() || null,
          slug: slug.trim() || null,
          imageMediaId,
        });
      }}
    >
      <FormField label="Nombre" help="La firma, tal como debe leerse.">
        <input
          required
          maxLength={120}
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            if (mode === "create" && !slugTouched) {
              setSlug(slugify(event.target.value));
            }
          }}
          className={INPUT}
        />
      </FormField>

      <FormField
        label="Presentación"
        help="Una línea sobre tu experiencia — «10 años construyendo sitios web». Es lo que acompaña al nombre."
      >
        <input
          maxLength={200}
          value={tagline}
          onChange={(event) => setTagline(event.target.value)}
          className={INPUT}
        />
      </FormField>

      <FormField
        label="Cargo"
        help="Opcional — «Fundador de Factura», «Analista de datos»."
      >
        <input
          maxLength={120}
          value={jobTitle}
          onChange={(event) => setJobTitle(event.target.value)}
          className={INPUT}
        />
      </FormField>

      <FormField
        label="Retrato"
        help="Opcional. Una imagen de la biblioteca de medios. Mientras sea el retrato de alguien no se puede mover a la papelera."
      >
        <MediaPicker value={imageMediaId} onChange={setImageMediaId} />
      </FormField>

      <FormField
        label="Dirección"
        help="La futura página del autor, en /autores/…. Puede quedar vacía por ahora."
      >
        <input
          value={slug}
          onChange={(event) => {
            setSlugTouched(true);
            setSlug(slugify(event.target.value));
          }}
          className={INPUT}
        />
      </FormField>

      <FormField
        label="Biografía"
        help="Opcional y todavía sin usar: será el cuerpo de la página del autor."
      >
        <textarea
          maxLength={4000}
          rows={5}
          value={about}
          onChange={(event) => setAbout(event.target.value)}
          className={cn(INPUT, "resize-y")}
        />
      </FormField>

      <ActionError error={error} />
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <DialogButton
          type="submit"
          tone="accent"
          icon={mode === "create" ? "add" : "check"}
          disabled={busy}
          className="[form_&]:appearance-none"
        >
          <span className="sr-only">Enviar: </span>
          {busy ? "Guardando…" : mode === "create" ? "Crear" : "Guardar"}
        </DialogButton>
        <DialogCancel onClick={onCancel} disabled={busy} />
      </div>
    </form>
  );
}

function FormField({
  label,
  help,
  children,
}: {
  label: string;
  help: string;
  children: React.ReactNode;
}) {
  return (
    <label className="mt-5 block first:mt-0">
      <span className="mb-1.5 block font-mono text-micro tracking-label-wide text-muted uppercase">
        {label}
      </span>
      {children}
      <span className="mt-1.5 block font-mono text-[12px] leading-[1.6] text-muted">
        {help}
      </span>
    </label>
  );
}

function ActionError({ error }: { error: string | null }) {
  return error ? (
    <p
      role="alert"
      className="mt-5 mb-0 border-l-2 border-[var(--vendor-ochre)] py-2 pl-4 font-mono text-[13px] leading-[1.6] text-ink"
    >
      {error}
    </p>
  ) : null;
}

function RowButton({
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        "cursor-pointer border-0 bg-transparent p-0 font-mono text-micro tracking-label-wide text-muted uppercase transition-colors hover:text-accent disabled:cursor-not-allowed disabled:opacity-40",
        className,
      )}
    />
  );
}

const INPUT =
  "w-full border border-line bg-paper px-3 py-2 font-mono text-[13.5px] text-ink placeholder:text-muted focus:border-accent focus:outline-none";

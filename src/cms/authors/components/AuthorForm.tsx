"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { slugifyCategory as slugify } from "@/content-system/categories/slug";
import { cn } from "@/lib/cn";
import { DialogButton } from "@/cms/components/CmsDialog";
import { MediaPicker } from "@/cms/media/components/MediaPicker";
import { createAuthorAction, updateAuthorAction } from "../server/actions";
import type { ContentAuthorWithUsage } from "../server/service";

// The one form behind `/cms/authors/new` and `/cms/authors/[id]`. A save goes
// back to the list, which says what happened — the list is where an editor
// checks the result, and it keeps the two pages free of a "saved" state that
// would have to be cleared on the next keystroke.
//
// There is no delete. That is the house rule everywhere in this CMS, and here it
// is also a schema fact: `cms_author` has no `retired_at`, so a name on the list
// is permanent until one is added.

type FormValues = {
  name: string;
  tagline: string | null;
  jobTitle: string | null;
  imageMediaId: string | null;
  slug: string | null;
  about: string | null;
};

export function AuthorForm({ author }: { author?: ContentAuthorWithUsage }) {
  const mode = author ? "edit" : "create";
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState(author?.name ?? "");
  const [tagline, setTagline] = useState(author?.tagline ?? "");
  const [jobTitle, setJobTitle] = useState(author?.jobTitle ?? "");
  const [about, setAbout] = useState(author?.about ?? "");
  const [imageMediaId, setImageMediaId] = useState(
    author?.imageMediaId ?? null,
  );
  const [slug, setSlug] = useState(author?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(false);

  const submit = (values: FormValues) => {
    setError(null);
    startTransition(async () => {
      try {
        const result = author
          ? await updateAuthorAction({ id: author.id, patch: values })
          : await createAuthorAction(values);
        if (!result.ok) {
          setError(result.message ?? "No se pudo guardar el cambio.");
          return;
        }
        router.push(`/cms/authors?aviso=${author ? "actualizado" : "creado"}`);
      } catch {
        setError(
          "No se pudo guardar el cambio. Vuelve a intentarlo; si sigue fallando, avisa.",
        );
      }
    });
  };

  return (
    <form
      className="max-w-[640px]"
      onSubmit={(event) => {
        event.preventDefault();
        submit({
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

      {error && (
        <p
          role="alert"
          className="mt-5 mb-0 border-l-2 border-[var(--vendor-ochre)] py-2 pl-4 font-mono text-[13px] leading-[1.6] text-ink"
        >
          {error}
        </p>
      )}
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <DialogButton
          type="submit"
          tone="accent"
          icon={mode === "create" ? "add" : "check"}
          disabled={pending}
        >
          {pending ? "Guardando…" : mode === "create" ? "Crear" : "Guardar"}
        </DialogButton>
        <Link
          href="/cms/authors"
          aria-disabled={pending}
          className={cn(
            "ml-auto px-3 py-2 font-mono text-micro tracking-label-wide text-muted uppercase no-underline transition-colors hover:text-accent",
            pending && "pointer-events-none opacity-45",
          )}
        >
          Cancelar
        </Link>
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

const INPUT =
  "w-full border border-line bg-paper px-3 py-2 font-mono text-[13.5px] text-ink placeholder:text-muted focus:border-accent focus:outline-none";

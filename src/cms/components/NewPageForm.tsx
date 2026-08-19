"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createContentAction } from "@/cms/server/actions";
import type { CmsSection } from "@/cms/sections";
import { cmsEditPath } from "@/cms/sections";
import type { ParentOption } from "./fields/MetadataField";

// Creating a page. Deliberately the smallest form that produces a *valid*
// draft: everything else is edited afterwards, where the full form and the
// validation tab live.
//
// The body starts from a skeleton rather than empty, because the Phase 5 gate
// is that someone who does not know React can create and save a draft — and the
// shape of a guide (sections at `##`, a related-guides block, a closing CTA) is
// exactly the knowledge a blank box assumes you already have.

const GUIDE_SKELETON = `## Primera sección

Escribe aquí.

## Segunda sección

Escribe aquí.

<RelatedGuides />

<ClosingCta title="Un título específico de esta página">

Dos frases sobre por qué usar Factura para este tema en concreto.

</ClosingCta>
`;

const DATA_SKELETON = `## Primera sección

Escribe aquí. Indica la fecha, el lugar y qué mide el dato antes de presentar el análisis.

## Qué muestran los datos

Explica el resultado y enlaza la metodología cuando corresponda.

<ClosingCta title="Un título específico de esta página">

Dos frases sobre por qué usar Factura para este tema en concreto.

</ClosingCta>

<Fuentes />
`;

export function NewPageForm({
  section,
  parentOptions,
}: {
  section: CmsSection;
  parentOptions: readonly ParentOption[];
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [parentId, setParentId] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parent = parentOptions.find((option) => option.value === parentId);
  const fullSlug = parent ? `${parent.slug}/${slug}` : slug;
  const body = section.id === "guias" ? GUIDE_SKELETON : DATA_SKELETON;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const result = await createContentAction({
        section: section.id,
        slug: fullSlug,
        title,
        description: "",
        summary: "",
        cta: "",
        body,
        metadata: { keywords: [], categories: [] },
        parentId: parentId || null,
      });

      if (result.ok) {
        router.push(cmsEditPath(section.id, result.data.id));
        return;
      }
      setError(result.message);
    } catch {
      // An action can still fail in ways it does not model — the database is
      // down, a deploy landed mid-request. Saying so beats a button that spins
      // forever with no explanation.
      setError(
        "No se pudo crear la página. Vuelve a intentarlo; si sigue fallando, avisa.",
      );
    }
    setBusy(false);
  };

  return (
    <form onSubmit={submit} className="max-w-[560px]">
      <Field
        label="Título"
        help="El encabezado de la página. Se puede cambiar después."
      >
        <input
          type="text"
          required
          value={title}
          onChange={(event) => {
            setTitle(event.target.value);
            // The slug follows the title until it is edited by hand, then it
            // stops moving — retyping a headline should not silently change a
            // URL someone already chose.
            if (!slugTouched) setSlug(slugify(event.target.value));
          }}
          className={inputClass}
        />
      </Field>

      <Field
        label="Dirección"
        help="Minúsculas, sin acentos ni espacios. No se puede cambiar una vez publicada."
      >
        <input
          type="text"
          required
          value={slug}
          onChange={(event) => {
            setSlugTouched(true);
            setSlug(slugify(event.target.value));
          }}
          className={inputClass}
        />
        <p className="font-mono text-[12px] text-muted mt-1.5 mb-0">
          {section.publicPath}/{fullSlug || "…"}
        </p>
      </Field>

      {parentOptions.length > 0 && (
        <Field
          label="Página madre"
          help="Deja «Ninguna» para una página de primer nivel."
        >
          <select
            value={parentId}
            onChange={(event) => setParentId(event.target.value)}
            className={inputClass}
          >
            <option value="">Ninguna (primer nivel)</option>
            {parentOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>
      )}

      {error && (
        <p
          role="alert"
          className="border-l-2 border-[var(--vendor-ochre)] pl-4 py-2 font-mono text-[13px] leading-[1.6] text-ink mb-5"
        >
          {error}
        </p>
      )}

      <p className="font-mono text-[12px] leading-[1.6] text-muted mb-5">
        Se crea como borrador: no se ve en el sitio público hasta que la
        publiques.
      </p>

      <button
        type="submit"
        disabled={busy || !title || !slug}
        className="border border-accent bg-accent px-4 py-2 font-mono text-micro uppercase tracking-label-wide text-paper disabled:opacity-50"
      >
        {busy ? "Creando…" : "Crear borrador"}
      </button>
    </form>
  );
}

const inputClass =
  "w-full border border-line bg-paper px-3 py-2 font-mono text-[13.5px] text-ink placeholder:text-muted focus:border-accent focus:outline-none";

function Field({
  label,
  help,
  children,
}: {
  label: string;
  help: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-6">
      <label className="block font-mono text-micro uppercase tracking-label-wide text-muted mb-1.5">
        {label}
        <span className="text-accent ml-1" aria-hidden="true">
          *
        </span>
      </label>
      {children}
      <p className="font-mono text-[12px] leading-[1.6] text-muted mt-1.5 mb-0">
        {help}
      </p>
    </div>
  );
}

/** Title → slug. Accents folded rather than dropped, so "cómo" becomes "como"
 * and not "cmo". */
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

"use client";

import { useState, useTransition } from "react";
import type { ContentCategoryWithUsage } from "@/content-system/categories/types";
import { slugifyCategory } from "@/content-system/categories/slug";
import type { ContentSection } from "@/content-system/types";
import { cn } from "@/lib/cn";
import {
  CmsModal,
  DialogButton,
  DialogCancel,
} from "@/cms/components/CmsDialog";
import {
  createCategoryAction,
  listCategoriesAction,
  renameCategoryAction,
  retireCategoryAction,
  updateCategoryAction,
} from "../server/actions";

type View =
  | { kind: "list" }
  | { kind: "create" }
  | { kind: "edit"; category: ContentCategoryWithUsage }
  | { kind: "rename"; category: ContentCategoryWithUsage }
  | { kind: "retire"; category: ContentCategoryWithUsage };

export function CategoryManager({
  section,
  initialCategories,
}: {
  section: ContentSection;
  initialCategories: ContentCategoryWithUsage[];
}) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>({ kind: "list" });
  const [categories, setCategories] = useState(initialCategories);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const close = () => {
    if (pending) return;
    setOpen(false);
    setView({ kind: "list" });
    setError(null);
  };

  const reload = async () => {
    setCategories(await listCategoriesAction(section));
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
        await reload();
        setNotice(success);
        setView({ kind: "list" });
      } catch {
        setError(
          "No se pudo guardar el cambio. Vuelve a intentarlo; si sigue fallando, avisa.",
        );
      }
    });
  };

  const openManager = () => {
    setNotice(null);
    setError(null);
    setView({ kind: "list" });
    setOpen(true);
  };

  const title =
    view.kind === "list"
      ? "Categorías de la sección"
      : view.kind === "create"
        ? "Nueva categoría"
        : view.kind === "edit"
          ? "Editar categoría"
          : view.kind === "rename"
            ? "Cambiar la dirección"
            : "Eliminar categoría";

  return (
    <>
      <button
        type="button"
        onClick={openManager}
        className="inline-flex cursor-pointer items-center gap-2 border border-line bg-paper px-4 py-2 font-mono text-micro tracking-label-wide text-ink uppercase transition-colors hover:border-accent hover:text-accent"
      >
        Categorías
      </button>

      {open && (
        <CmsModal
          eyebrow="Organización"
          title={title}
          busy={pending}
          onClose={close}
          width="780px"
        >
          {view.kind === "list" ? (
            <CategoryList
              section={section}
              categories={categories}
              notice={notice}
              onCreate={() => {
                setError(null);
                setView({ kind: "create" });
              }}
              onEdit={(category) => {
                setError(null);
                setView({ kind: "edit", category });
              }}
              onRename={(category) => {
                setError(null);
                setView({ kind: "rename", category });
              }}
              onRetire={(category) => {
                setError(null);
                setView({ kind: "retire", category });
              }}
              onClose={close}
            />
          ) : view.kind === "create" ? (
            <CategoryForm
              mode="create"
              busy={pending}
              error={error}
              onCancel={() => setView({ kind: "list" })}
              onSubmit={(values) =>
                run(
                  () => createCategoryAction({ section, ...values }),
                  "Categoría creada.",
                )
              }
            />
          ) : view.kind === "edit" ? (
            <CategoryForm
              mode="edit"
              category={view.category}
              busy={pending}
              error={error}
              onCancel={() => setView({ kind: "list" })}
              onSubmit={(values) =>
                run(
                  () =>
                    updateCategoryAction(section, {
                      id: view.category.id,
                      expectedLockVersion: view.category.lockVersion,
                      patch: {
                        label: values.label,
                        title: values.title,
                        description: values.description,
                        sortOrder: values.sortOrder,
                      },
                    }),
                  "Categoría actualizada.",
                )
              }
            />
          ) : view.kind === "rename" ? (
            <RenameForm
              category={view.category}
              section={section}
              busy={pending}
              error={error}
              onCancel={() => setView({ kind: "list" })}
              onSubmit={(slug) =>
                run(
                  () =>
                    renameCategoryAction(section, {
                      id: view.category.id,
                      expectedLockVersion: view.category.lockVersion,
                      slug,
                    }),
                  "Dirección cambiada y redirección creada.",
                )
              }
            />
          ) : (
            <RetireForm
              category={view.category}
              busy={pending}
              error={error}
              onCancel={() => setView({ kind: "list" })}
              onConfirm={() =>
                run(
                  () =>
                    retireCategoryAction(section, {
                      id: view.category.id,
                      expectedLockVersion: view.category.lockVersion,
                    }),
                  "Categoría eliminada.",
                )
              }
            />
          )}
        </CmsModal>
      )}
    </>
  );
}

function CategoryList({
  section,
  categories,
  notice,
  onCreate,
  onEdit,
  onRename,
  onRetire,
  onClose,
}: {
  section: ContentSection;
  categories: ContentCategoryWithUsage[];
  notice: string | null;
  onCreate: () => void;
  onEdit: (category: ContentCategoryWithUsage) => void;
  onRename: (category: ContentCategoryWithUsage) => void;
  onRetire: (category: ContentCategoryWithUsage) => void;
  onClose: () => void;
}) {
  return (
    <div className="mt-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="m-0 max-w-[58ch] font-mono text-[13px] leading-[1.6] text-muted">
          Cada categoría pertenece sólo a esta sección. Editar su nombre cambia
          el texto; cambiar su dirección conserva el enlace anterior con una
          redirección permanente.
        </p>
        <DialogButton tone="accent" icon="add" onClick={onCreate}>
          Nueva
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

      {categories.length === 0 ? (
        <p className="mt-7 mb-0 border-y border-line py-6 font-mono text-[13px] text-muted">
          Esta sección todavía no tiene categorías.
        </p>
      ) : (
        <ul className="mt-6 mb-0 list-none border-t border-line p-0">
          {categories.map((category) => (
            <li key={category.id} className="border-b border-line py-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="m-0 text-[15px] font-semibold text-ink">
                    {category.label}
                  </p>
                  <p className="mt-1 mb-0 break-all font-mono text-[12px] text-muted">
                    /{section}/categoria/{category.slug}
                    <span className="ml-3 whitespace-nowrap">
                      {category.usageCount}{" "}
                      {category.usageCount === 1 ? "página" : "páginas"}
                    </span>
                  </p>
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-2">
                  <RowButton onClick={() => onEdit(category)}>Editar</RowButton>
                  <RowButton onClick={() => onRename(category)}>
                    Dirección
                  </RowButton>
                  <RowButton
                    onClick={() => onRetire(category)}
                    disabled={category.usageCount > 0}
                    title={
                      category.usageCount > 0
                        ? "Quita esta categoría de sus páginas antes de eliminarla."
                        : undefined
                    }
                    danger
                  >
                    Eliminar
                  </RowButton>
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
  label: string;
  title: string;
  description: string;
  sortOrder: number;
  slug?: string;
};

function CategoryForm({
  mode,
  category,
  busy,
  error,
  onCancel,
  onSubmit,
}: {
  mode: "create" | "edit";
  category?: ContentCategoryWithUsage;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (values: FormValues) => void;
}) {
  const [label, setLabel] = useState(category?.label ?? "");
  const [title, setTitle] = useState(category?.title ?? "");
  const [description, setDescription] = useState(category?.description ?? "");
  const [sortOrder, setSortOrder] = useState(category?.sortOrder ?? 0);
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);

  return (
    <form
      className="mt-5"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit({
          label,
          title,
          description,
          sortOrder,
          ...(mode === "create" ? { slug } : {}),
        });
      }}
    >
      <FormField
        label="Etiqueta"
        help="El nombre corto que aparece en los filtros."
      >
        <input
          required
          maxLength={80}
          value={label}
          onChange={(event) => {
            setLabel(event.target.value);
            if (mode === "create" && !slugTouched) {
              setSlug(slugifyCategory(event.target.value));
            }
          }}
          className={INPUT}
        />
      </FormField>

      {mode === "create" && (
        <FormField
          label="Dirección"
          help="Sólo una persona puede elegirla o cambiarla. Los agentes la generan desde la etiqueta."
        >
          <input
            required
            value={slug}
            onChange={(event) => {
              setSlugTouched(true);
              setSlug(slugifyCategory(event.target.value));
            }}
            className={INPUT}
          />
        </FormField>
      )}

      <FormField
        label="Título"
        help="El título principal de la página de categoría."
      >
        <input
          required
          maxLength={180}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          className={INPUT}
        />
      </FormField>

      <FormField
        label="Descripción"
        help="Una frase para lectores y buscadores."
      >
        <textarea
          required
          maxLength={220}
          rows={3}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          className={cn(INPUT, "resize-y")}
        />
      </FormField>

      <FormField label="Orden" help="Los números menores aparecen primero.">
        <input
          type="number"
          value={sortOrder}
          onChange={(event) => setSortOrder(Number(event.target.value))}
          className={cn(INPUT, "max-w-32")}
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

function RenameForm({
  category,
  section,
  busy,
  error,
  onCancel,
  onSubmit,
}: {
  category: ContentCategoryWithUsage;
  section: ContentSection;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (slug: string) => void;
}) {
  const [slug, setSlug] = useState(category.slug);
  return (
    <form
      className="mt-5"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(slug);
      }}
    >
      <p className="m-0 font-mono text-[13px] leading-[1.6] text-muted">
        La dirección anterior seguirá funcionando con una redirección
        permanente. Esta operación está reservada a personas.
      </p>
      <FormField
        label="Nueva dirección"
        help={`/${section}/categoria/${slug || "…"}`}
      >
        <input
          required
          value={slug}
          onChange={(event) => setSlug(slugifyCategory(event.target.value))}
          className={INPUT}
        />
      </FormField>
      <ActionError error={error} />
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={busy || slug === category.slug}
          className="inline-flex cursor-pointer items-center gap-2 border border-accent bg-accent px-3 py-2 font-mono text-micro tracking-label-wide text-paper uppercase transition-colors hover:border-ink hover:bg-ink disabled:cursor-not-allowed disabled:opacity-45"
        >
          {busy ? "Cambiando…" : "Cambiar y redirigir"}
        </button>
        <DialogCancel onClick={onCancel} disabled={busy} />
      </div>
    </form>
  );
}

function RetireForm({
  category,
  busy,
  error,
  onCancel,
  onConfirm,
}: {
  category: ContentCategoryWithUsage;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="mt-5">
      <p className="m-0 font-mono text-[13px] leading-[1.6] text-muted">
        Se eliminará <strong className="text-ink">{category.label}</strong> de
        las opciones y del sitio. Sólo se permite cuando ninguna página la usa;
        esta operación está reservada a personas.
      </p>
      <ActionError error={error} />
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy || category.usageCount > 0}
          className="cursor-pointer border border-[var(--danger,var(--vendor-ochre))] px-3 py-2 font-mono text-micro tracking-label-wide text-[var(--danger,var(--vendor-ochre))] uppercase transition-colors hover:bg-[var(--danger,var(--vendor-ochre))] hover:text-paper disabled:cursor-not-allowed disabled:opacity-45"
        >
          {busy ? "Eliminando…" : "Eliminar categoría"}
        </button>
        <DialogCancel onClick={onCancel} disabled={busy} />
      </div>
    </div>
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
  danger = false,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { danger?: boolean }) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        "cursor-pointer border-0 bg-transparent p-0 font-mono text-micro tracking-label-wide uppercase transition-colors disabled:cursor-not-allowed disabled:opacity-40",
        danger ? "text-[var(--vendor-ochre)]" : "text-muted hover:text-accent",
        className,
      )}
    />
  );
}

const INPUT =
  "w-full border border-line bg-paper px-3 py-2 font-mono text-[13.5px] text-ink placeholder:text-muted focus:border-accent focus:outline-none";

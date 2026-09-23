"use client";

import { useMemo, useState, useTransition } from "react";
import {
  INSIGHT_LIMITS,
  insightInstant,
  type ContentInsight,
} from "@/content-system/insights/types";
import type { ContentSection } from "@/content-system/types";
import { formatContentDate } from "@/lib/content-date";
import { cn } from "@/lib/cn";
import {
  CmsConfirmDialog,
  CmsModal,
  DialogButton,
  DialogCancel,
} from "@/cms/components/CmsDialog";
import { CmsSelect } from "@/cms/components/CmsSelect";
import { Counter, inputClass } from "@/cms/components/fields/controls";
import { CMS_SECTIONS } from "@/cms/sections";
import {
  createInsightAction,
  deleteInsightAction,
  listInsightsAction,
  updateInsightAction,
} from "../server/actions";
import type { InsightPageOption } from "../types";

// The whole «Destacados» screen: the list, and a modal to write or edit one.
//
// An insight is two sentences and a page. Everything else the public card
// shows — the section, the address, the category — belongs to the page, so the
// form shows it read-only once a page is chosen rather than asking for it.

type View =
  | { kind: "list" }
  | { kind: "create" }
  | { kind: "edit"; insight: ContentInsight };

const SECTION_LABEL = new Map(CMS_SECTIONS.map((s) => [s.id, s.label]));

const STATUS_LABEL = {
  draft: "borrador",
  preview: "vista previa",
  published: "publicada",
} as const;

export function InsightManager({
  initialInsights,
  pages,
}: {
  initialInsights: ContentInsight[];
  pages: InsightPageOption[];
}) {
  const [insights, setInsights] = useState(initialInsights);
  const [view, setView] = useState<View>({ kind: "list" });
  const [filter, setFilter] = useState<"" | ContentSection | "home">("");
  const [deleting, setDeleting] = useState<ContentInsight | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const pageById = useMemo(
    () => new Map(pages.map((page) => [page.id, page])),
    [pages],
  );

  const shown = insights.filter((insight) => {
    if (filter === "") return true;
    if (filter === "home") return insight.onHomepage;
    return pageById.get(insight.pageId)?.section === filter;
  });

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
        setInsights(await listInsightsAction());
        setNotice(success);
        setView({ kind: "list" });
        setDeleting(null);
      } catch {
        setError(
          "No se pudo guardar el cambio. Vuelve a intentarlo; si sigue fallando, avisa.",
        );
      }
    });
  };

  const closeForm = () => {
    if (pending) return;
    setView({ kind: "list" });
    setError(null);
  };

  return (
    <>
      <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
        <div className="w-full sm:w-[260px]">
          <CmsSelect
            aria-label="Filtrar destacados"
            value={filter}
            onChange={(value) => setFilter(value as typeof filter)}
            options={[
              { value: "", label: "Todos" },
              { value: "home", label: "Página principal" },
              ...CMS_SECTIONS.map((s) => ({ value: s.id, label: s.label })),
            ]}
          />
        </div>
        <DialogButton
          tone="accent"
          icon="add"
          onClick={() => {
            setNotice(null);
            setError(null);
            setView({ kind: "create" });
          }}
        >
          Nuevo destacado
        </DialogButton>
      </div>

      {notice && (
        <p
          role="status"
          className="mt-5 mb-0 border-l-2 border-ok py-2 pl-4 font-mono text-[13px] text-ink"
        >
          {notice}
        </p>
      )}

      {shown.length === 0 ? (
        <p className="mt-7 mb-0 border-y border-line py-6 font-mono text-[13px] text-muted">
          {insights.length === 0
            ? "Todavía no hay destacados."
            : "Ningún destacado coincide con el filtro."}
        </p>
      ) : (
        <ul className="mt-6 mb-0 list-none border-t border-line p-0">
          {shown.map((insight) => (
            <InsightRow
              key={insight.id}
              insight={insight}
              page={pageById.get(insight.pageId)}
              onEdit={() => {
                setNotice(null);
                setError(null);
                setView({ kind: "edit", insight });
              }}
              onDelete={() => {
                setNotice(null);
                setError(null);
                setDeleting(insight);
              }}
            />
          ))}
        </ul>
      )}

      {view.kind !== "list" && (
        <CmsModal
          eyebrow="Destacados"
          title={
            view.kind === "create" ? "Nuevo destacado" : "Editar destacado"
          }
          busy={pending}
          onClose={closeForm}
          width="640px"
        >
          <InsightForm
            key={view.kind === "edit" ? view.insight.id : "new"}
            insight={view.kind === "edit" ? view.insight : undefined}
            pages={pages}
            busy={pending}
            error={error}
            onCancel={closeForm}
            onSubmit={(values) =>
              view.kind === "edit"
                ? run(
                    () => updateInsightAction(view.insight.id, values),
                    "Destacado actualizado.",
                  )
                : run(() => createInsightAction(values), "Destacado creado.")
            }
          />
        </CmsModal>
      )}

      {deleting && (
        <CmsConfirmDialog
          eyebrow="Destacados"
          title="¿Eliminar este destacado?"
          description={`«${deleting.title}» deja de mostrarse en el sitio. La página a la que apunta no cambia.`}
          details={error ? [error] : undefined}
          confirmLabel="Eliminar"
          confirmIcon="delete"
          tone="ochre"
          busy={pending}
          onConfirm={() =>
            run(() => deleteInsightAction(deleting.id), "Destacado eliminado.")
          }
          onCancel={() => {
            if (pending) return;
            setDeleting(null);
            setError(null);
          }}
        />
      )}
    </>
  );
}

function InsightRow({
  insight,
  page,
  onEdit,
  onDelete,
}: {
  insight: ContentInsight;
  page: InsightPageOption | undefined;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const hidden = !page || page.status !== "published";
  return (
    <li className="border-b border-line py-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="m-0 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-micro tracking-label-wide text-muted uppercase">
            <span>{formatContentDate(insightInstant(insight.date))}</span>
            {page && <span>{SECTION_LABEL.get(page.section)}</span>}
            {insight.onHomepage && (
              <span className="text-accent">Página principal</span>
            )}
          </p>
          <p className="mt-1.5 mb-0 text-[15px] font-semibold text-ink">
            {insight.title}
          </p>
          <p className="mt-1 mb-0 font-mono text-[12.5px] leading-[1.6] text-ink/75">
            {insight.body}
          </p>
          <p className="mt-1.5 mb-0 break-all font-mono text-[12px] text-muted">
            {page ? (
              <>
                → {page.title}
                {page.category && (
                  <span className="ml-3 whitespace-nowrap">
                    · {page.category}
                  </span>
                )}
              </>
            ) : (
              "Página no encontrada"
            )}
          </p>
          {hidden && (
            <p className="mt-1.5 mb-0 font-mono text-[12px] text-[var(--vendor-ochre)]">
              No se muestra: la página está en{" "}
              {page ? STATUS_LABEL[page.status] : "ningún lado"}.
            </p>
          )}
        </div>
        <div className="flex flex-none flex-wrap gap-x-4 gap-y-2">
          <RowButton onClick={onEdit}>Editar</RowButton>
          <RowButton onClick={onDelete}>Eliminar</RowButton>
        </div>
      </div>
    </li>
  );
}

type FormValues = {
  pageId: string;
  title: string;
  body: string;
  date: string;
  onHomepage: boolean;
};

/** Today in Buenos Aires, as `YYYY-MM-DD` — the default for a new insight. */
const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(new Date());

function InsightForm({
  insight,
  pages,
  busy,
  error,
  onCancel,
  onSubmit,
}: {
  insight?: ContentInsight;
  pages: InsightPageOption[];
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (values: FormValues) => void;
}) {
  const initialPage = pages.find((p) => p.id === insight?.pageId);
  const [section, setSection] = useState<ContentSection>(
    initialPage?.section ?? CMS_SECTIONS[0].id,
  );
  const [pageId, setPageId] = useState(insight?.pageId ?? "");
  const [search, setSearch] = useState("");
  const [title, setTitle] = useState(insight?.title ?? "");
  const [body, setBody] = useState(insight?.body ?? "");
  const [date, setDate] = useState(insight?.date ?? today());
  const [onHomepage, setOnHomepage] = useState(insight?.onHomepage ?? false);

  const needle = search.trim().toLowerCase();
  const candidates = pages.filter(
    (p) =>
      p.section === section &&
      (!needle ||
        p.id === pageId ||
        p.title.toLowerCase().includes(needle) ||
        p.slug.toLowerCase().includes(needle)),
  );
  const chosen = pages.find((p) => p.id === pageId);

  return (
    <form
      className="mt-5"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit({ pageId, title, body, date, onHomepage });
      }}
    >
      <FieldLabel
        label="Página"
        help="La página que respalda el dato. El enlace, la sección y la categoría de la tarjeta salen de ella."
      >
        <div className="grid gap-2 sm:grid-cols-[180px_1fr]">
          <CmsSelect
            aria-label="Sección"
            value={section}
            onChange={(value) => {
              setSection(value as ContentSection);
              setPageId("");
            }}
            options={CMS_SECTIONS.map((s) => ({ value: s.id, label: s.label }))}
          />
          <input
            type="search"
            placeholder="Buscar por título o dirección…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className={inputClass}
          />
        </div>
        <div className="mt-2">
          <CmsSelect
            aria-label="Página"
            value={pageId}
            onChange={setPageId}
            options={[
              {
                value: "",
                label: candidates.length
                  ? "Elige una página…"
                  : "Ninguna página coincide",
              },
              ...candidates.map((p) => ({
                value: p.id,
                label:
                  p.status === "published"
                    ? p.title
                    : `${p.title} (${STATUS_LABEL[p.status]})`,
              })),
            ]}
          />
        </div>
      </FieldLabel>
      {chosen && (
        <p className="mt-2 mb-0 break-all font-mono text-[12px] leading-[1.6] text-muted">
          /{chosen.section}/{chosen.slug} · Categoría:{" "}
          {chosen.category ?? "sin categoría"}
          {chosen.status !== "published" &&
            " · No se mostrará hasta que la página se publique."}
        </p>
      )}

      <FieldLabel
        label="Título"
        help="El dato en una frase — «Nueva York cayó 15,3 % interanual en agosto»."
      >
        <input
          required
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          className={inputClass}
        />
        <Counter value={title} softMax={INSIGHT_LIMITS.title} />
      </FieldLabel>

      <FieldLabel label="Texto" help="Una línea de contexto debajo del título.">
        <textarea
          required
          rows={2}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          className={cn(inputClass, "resize-y")}
        />
        <Counter value={body} softMax={INSIGHT_LIMITS.body} />
      </FieldLabel>

      <FieldLabel
        label="Fecha"
        help="La fecha del dato. Ordena los destacados: los más recientes van primero."
      >
        <input
          required
          type="date"
          value={date}
          onChange={(event) => setDate(event.target.value)}
          className={cn(inputClass, "sm:w-[200px]")}
        />
      </FieldLabel>

      <label className="mt-5 flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={onHomepage}
          onChange={(event) => setOnHomepage(event.target.checked)}
          className="mt-0.5 size-4 accent-[var(--accent)]"
        />
        <span>
          <span className="block font-mono text-micro tracking-label-wide text-ink uppercase">
            Página principal
          </span>
          <span className="mt-1 block font-mono text-[12px] leading-[1.6] text-muted">
            También se muestra en la portada. En el índice de su sección se
            muestra siempre.
          </span>
        </span>
      </label>

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
          icon={insight ? "check" : "add"}
          disabled={busy}
        >
          {busy ? "Guardando…" : insight ? "Guardar" : "Crear"}
        </DialogButton>
        <DialogCancel onClick={onCancel} disabled={busy} />
      </div>
    </form>
  );
}

function FieldLabel({
  label,
  help,
  children,
}: {
  label: string;
  help: string;
  children: React.ReactNode;
}) {
  // A div, not a <label>: the page field holds three controls, and a label
  // wrapping several would forward every click to the first of them.
  return (
    <div className="mt-5 block first:mt-0">
      <span className="mb-1.5 block font-mono text-micro tracking-label-wide text-muted uppercase">
        {label}
      </span>
      {children}
      <span className="mt-1.5 block font-mono text-[12px] leading-[1.6] text-muted">
        {help}
      </span>
    </div>
  );
}

function RowButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className="cursor-pointer border-0 bg-transparent p-0 font-mono text-micro tracking-label-wide text-muted uppercase transition-colors hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
    />
  );
}

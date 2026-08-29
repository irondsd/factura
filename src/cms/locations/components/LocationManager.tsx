"use client";

import { useState, useTransition } from "react";
import type { ContentLocationWithUsage } from "@/content-system/locations/types";
import { slugifyLocation } from "@/content-system/locations/slug";
import { cn } from "@/lib/cn";
import { CmsModal, DialogButton, DialogCancel } from "@/cms/components/CmsDialog";
import {
  createLocationAction, listLocationsAction, renameLocationAction,
  retireLocationAction, updateLocationAction,
} from "../server/actions";

type View = { kind: "list" } | { kind: "create" } | { kind: "edit" | "rename" | "retire"; location: ContentLocationWithUsage };

export function LocationManager({ initialLocations }: { initialLocations: ContentLocationWithUsage[] }) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>({ kind: "list" });
  const [locations, setLocations] = useState(initialLocations);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const close = () => { if (!pending) { setOpen(false); setView({ kind: "list" }); setError(null); } };
  const run = (work: () => Promise<{ ok: boolean; message?: string }>, success: string) => {
    setError(null);
    startTransition(async () => {
      try {
        const result = await work();
        if (!result.ok) { setError(result.message ?? "No se pudo guardar el cambio."); return; }
        setLocations(await listLocationsAction()); setNotice(success); setView({ kind: "list" });
      } catch { setError("No se pudo guardar el cambio. Vuelve a intentarlo; si sigue fallando, avisa."); }
    });
  };
  const title = view.kind === "list" ? "Ubicaciones del sitio" : view.kind === "create" ? "Nueva ubicación" : view.kind === "edit" ? "Editar ubicación" : view.kind === "rename" ? "Cambiar la dirección" : "Eliminar ubicación";

  return (
    <>
      <button type="button" onClick={() => { setNotice(null); setError(null); setView({ kind: "list" }); setOpen(true); }} className={CARD}>
        <span className="flex items-baseline gap-3">
          <span className="font-display text-[21px] font-semibold tracking-[-0.015em]">Ubicaciones</span>
          <span className="font-mono text-micro tracking-label-wide text-muted uppercase">Global</span>
        </span>
        <span className="mt-2 block font-mono text-[13px] leading-[1.6] text-muted">Administra los lugares que conectan contenido de todas las secciones.</span>
      </button>
      {open && (
        <CmsModal eyebrow="Organización" title={title} busy={pending} onClose={close} width="780px">
          {view.kind === "list" ? (
            <LocationList locations={locations} notice={notice} onCreate={() => setView({ kind: "create" })} onOpen={(kind, location) => { setError(null); setView({ kind, location }); }} onClose={close} />
          ) : view.kind === "create" ? (
            <LocationForm mode="create" busy={pending} error={error} onCancel={() => setView({ kind: "list" })} onSubmit={(values) => run(() => createLocationAction(values), "Ubicación creada.")} />
          ) : view.kind === "edit" ? (
            <LocationForm mode="edit" location={view.location} busy={pending} error={error} onCancel={() => setView({ kind: "list" })} onSubmit={(values) => run(() => updateLocationAction({ id: view.location.id, expectedLockVersion: view.location.lockVersion, patch: values }), "Ubicación actualizada.")} />
          ) : view.kind === "rename" ? (
            <RenameForm location={view.location} busy={pending} error={error} onCancel={() => setView({ kind: "list" })} onSubmit={(slug) => run(() => renameLocationAction({ id: view.location.id, expectedLockVersion: view.location.lockVersion, slug }), "Dirección cambiada y redirección creada.")} />
          ) : (
            <RetireForm location={view.location} busy={pending} error={error} onCancel={() => setView({ kind: "list" })} onConfirm={() => run(() => retireLocationAction({ id: view.location.id, expectedLockVersion: view.location.lockVersion }), "Ubicación eliminada.")} />
          )}
        </CmsModal>
      )}
    </>
  );
}

function LocationList({ locations, notice, onCreate, onOpen, onClose }: { locations: ContentLocationWithUsage[]; notice: string | null; onCreate: () => void; onOpen: (kind: "edit" | "rename" | "retire", location: ContentLocationWithUsage) => void; onClose: () => void }) {
  return <div className="mt-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <p className="m-0 max-w-[58ch] font-mono text-[13px] leading-[1.6] text-muted">Son globales para guías, noticias, estadísticas e investigaciones. Cambiar una dirección conserva la anterior con una redirección permanente.</p>
      <DialogButton tone="accent" icon="add" onClick={onCreate}>Nueva</DialogButton>
    </div>
    {notice && <p role="status" className="mt-4 mb-0 border-l-2 border-ok py-2 pl-4 font-mono text-[13px] text-ink">{notice}</p>}
    {locations.length === 0 ? <p className="mt-7 mb-0 border-y border-line py-6 font-mono text-[13px] text-muted">Todavía no hay ubicaciones.</p> : (
      <ul className="mt-6 mb-0 list-none border-t border-line p-0">{locations.map((location) => <li key={location.id} className="border-b border-line py-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0">
          <p className="m-0 text-[15px] font-semibold text-ink">{location.label}</p>
          <p className="mt-1 mb-0 break-all font-mono text-[12px] text-muted">/ubicacion/{location.slug}<span className="ml-3 whitespace-nowrap">{location.usageCount} {location.usageCount === 1 ? "página" : "páginas"}</span></p>
        </div><div className="flex flex-wrap gap-x-3 gap-y-2">
          <RowButton onClick={() => onOpen("edit", location)}>Editar</RowButton><RowButton onClick={() => onOpen("rename", location)}>Dirección</RowButton><RowButton danger onClick={() => onOpen("retire", location)}>Eliminar</RowButton>
        </div></div>
      </li>)}</ul>
    )}
    <div className="mt-6 flex"><DialogCancel onClick={onClose}>Cerrar</DialogCancel></div>
  </div>;
}

type Values = { label: string; title: string; description: string; sortOrder: number; slug?: string };
function LocationForm({ mode, location, busy, error, onCancel, onSubmit }: { mode: "create" | "edit"; location?: ContentLocationWithUsage; busy: boolean; error: string | null; onCancel: () => void; onSubmit: (values: Values) => void }) {
  const [label, setLabel] = useState(location?.label ?? ""); const [title, setTitle] = useState(location?.title ?? ""); const [description, setDescription] = useState(location?.description ?? ""); const [sortOrder, setSortOrder] = useState(location?.sortOrder ?? 0); const [slug, setSlug] = useState(""); const [slugTouched, setSlugTouched] = useState(false);
  return <form className="mt-5" onSubmit={(event) => { event.preventDefault(); onSubmit({ label, title, description, sortOrder, ...(mode === "create" ? { slug } : {}) }); }}>
    <FormField label="Etiqueta" help="El nombre corto que aparece en chips y listados."><input required maxLength={80} value={label} onChange={(event) => { setLabel(event.target.value); if (mode === "create" && !slugTouched) setSlug(slugifyLocation(event.target.value)); }} className={INPUT} /></FormField>
    {mode === "create" && <FormField label="Dirección" help="Los agentes la generan desde la etiqueta; una persona puede ajustarla al crear."><input required value={slug} onChange={(event) => { setSlugTouched(true); setSlug(slugifyLocation(event.target.value)); }} className={INPUT} /></FormField>}
    <FormField label="Título" help="El título principal de la página de ubicación."><input required maxLength={180} value={title} onChange={(event) => setTitle(event.target.value)} className={INPUT} /></FormField>
    <FormField label="Descripción" help="Una frase precisa para lectores y buscadores."><textarea required maxLength={220} rows={3} value={description} onChange={(event) => setDescription(event.target.value)} className={cn(INPUT, "resize-y")} /></FormField>
    <FormField label="Orden" help="Los números menores aparecen primero."><input type="number" value={sortOrder} onChange={(event) => setSortOrder(Number(event.target.value))} className={cn(INPUT, "max-w-32")} /></FormField>
    <ActionError error={error} /><Actions busy={busy} submit={mode === "create" ? "Crear" : "Guardar"} onCancel={onCancel} />
  </form>;
}

function RenameForm({ location, busy, error, onCancel, onSubmit }: { location: ContentLocationWithUsage; busy: boolean; error: string | null; onCancel: () => void; onSubmit: (slug: string) => void }) {
  const [slug, setSlug] = useState(location.slug);
  return <form className="mt-5" onSubmit={(event) => { event.preventDefault(); onSubmit(slug); }}><p className="m-0 font-mono text-[13px] leading-[1.6] text-muted">La dirección anterior seguirá funcionando con una redirección permanente. Esta operación está reservada a personas.</p><FormField label="Nueva dirección" help={`/ubicacion/${slug || "…"}`}><input required value={slug} onChange={(event) => setSlug(slugifyLocation(event.target.value))} className={INPUT} /></FormField><ActionError error={error} /><div className="mt-6 flex gap-2"><button type="submit" disabled={busy || slug === location.slug} className={PRIMARY}>{busy ? "Cambiando…" : "Cambiar y redirigir"}</button><DialogCancel onClick={onCancel} disabled={busy} /></div></form>;
}
function RetireForm({ location, busy, error, onCancel, onConfirm }: { location: ContentLocationWithUsage; busy: boolean; error: string | null; onCancel: () => void; onConfirm: () => void }) { return <div className="mt-5"><p className="m-0 font-mono text-[13px] leading-[1.6] text-muted">Se retirará <strong className="text-ink">{location.label}</strong> de las opciones y del sitio. Sólo se permite cuando ninguna revisión activa la usa.</p>{location.usageCount > 0 && <div className="mt-5 border border-line bg-paper p-4"><p className="m-0 font-mono text-[12px] tracking-label-wide text-[var(--vendor-ochre)] uppercase">En uso en {location.usageCount} {location.usageCount === 1 ? "página" : "páginas"}</p><ul className="mt-3 mb-0 list-none space-y-3 p-0">{location.usage?.map((page) => <li key={page.id}><p className="m-0 text-[14px] font-semibold text-ink">{page.title}</p><p className="mt-1 mb-0 break-all font-mono text-[12px] text-muted">/{page.section}/{page.slug} · {page.status}</p></li>)}</ul><p className="mt-4 mb-0 font-mono text-[12px] leading-[1.6] text-muted">Quita esta ubicación de esas revisiones antes de eliminarla.</p></div>}<ActionError error={error} /><div className="mt-6 flex gap-2"><button type="button" onClick={onConfirm} disabled={busy || location.usageCount > 0} className={DANGER}>{busy ? "Eliminando…" : "Eliminar ubicación"}</button><DialogCancel onClick={onCancel} disabled={busy} /></div></div>; }
function Actions({ busy, submit, onCancel }: { busy: boolean; submit: string; onCancel: () => void }) { return <div className="mt-6 flex gap-2"><button type="submit" disabled={busy} className={PRIMARY}>{busy ? "Guardando…" : submit}</button><DialogCancel onClick={onCancel} disabled={busy} /></div>; }
function FormField({ label, help, children }: { label: string; help: string; children: React.ReactNode }) { return <label className="mt-5 block first:mt-0"><span className="mb-1.5 block font-mono text-micro tracking-label-wide text-muted uppercase">{label}</span>{children}<span className="mt-1.5 block font-mono text-[12px] leading-[1.6] text-muted">{help}</span></label>; }
function ActionError({ error }: { error: string | null }) { return error ? <p role="alert" className="mt-5 mb-0 border-l-2 border-[var(--vendor-ochre)] py-2 pl-4 font-mono text-[13px] text-ink">{error}</p> : null; }
function RowButton({ danger = false, className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { danger?: boolean }) { return <button type="button" {...props} className={cn("cursor-pointer border-0 bg-transparent p-0 font-mono text-micro tracking-label-wide uppercase transition-colors disabled:cursor-not-allowed disabled:opacity-40", danger ? "text-[var(--vendor-ochre)]" : "text-muted hover:text-accent", className)} />; }
const CARD = "block w-full cursor-pointer border border-line bg-card px-5 py-5 text-left text-ink transition-colors hover:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const INPUT = "w-full border border-line bg-paper px-3 py-2 font-mono text-[13.5px] text-ink placeholder:text-muted focus:border-accent focus:outline-none";
const PRIMARY = "cursor-pointer border border-accent bg-accent px-3 py-2 font-mono text-micro tracking-label-wide text-paper uppercase transition-colors hover:border-ink hover:bg-ink disabled:cursor-not-allowed disabled:opacity-45";
const DANGER = "cursor-pointer border border-[var(--vendor-ochre)] px-3 py-2 font-mono text-micro tracking-label-wide text-[var(--vendor-ochre)] uppercase hover:bg-[var(--vendor-ochre)] hover:text-paper disabled:opacity-45";

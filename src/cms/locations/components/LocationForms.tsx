"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { ContentLocationWithUsage } from "@/content-system/locations/types";
import { slugifyLocation } from "@/content-system/locations/slug";
import { cn } from "@/lib/cn";
import {
  createLocationAction,
  renameLocationAction,
  retireLocationAction,
  updateLocationAction,
} from "../server/actions";

// The browser half of `/cms/locations/new` and `/cms/locations/[id]`.
//
// The detail page puts all three operations on one screen — details, address,
// retirement — because they are three things you do *to one location*, and each
// has its own consequences worth reading before you act: a rename leaves a
// redirect behind, a retirement is refused while any page still points here.
// Details and address save in place and refresh the server render, which is
// what hands the next save its fresh `lockVersion`. Retiring goes back to the
// list, since the page it was on no longer describes anything.

type Result = { ok: boolean; message?: string };

function useSave() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (work: () => Promise<Result>, onSuccess: () => void) => {
    setError(null);
    startTransition(async () => {
      try {
        const result = await work();
        if (!result.ok) {
          setError(result.message ?? "No se pudo guardar el cambio.");
          return;
        }
        onSuccess();
      } catch {
        setError(
          "No se pudo guardar el cambio. Vuelve a intentarlo; si sigue fallando, avisa.",
        );
      }
    });
  };
  return { pending, error, run };
}

export function NewLocationForm() {
  const router = useRouter();
  const { pending, error, run } = useSave();
  const [label, setLabel] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);

  return (
    <form
      className="max-w-[640px]"
      onSubmit={(event) => {
        event.preventDefault();
        run(
          () => createLocationAction({ label, title, description, slug }),
          () => router.push("/cms/locations?aviso=creada"),
        );
      }}
    >
      <FormField
        label="Etiqueta"
        help="El nombre corto que aparece en chips y listados."
      >
        <input
          required
          maxLength={80}
          value={label}
          onChange={(event) => {
            setLabel(event.target.value);
            if (!slugTouched) setSlug(slugifyLocation(event.target.value));
          }}
          className={INPUT}
        />
      </FormField>
      <FormField
        label="Dirección"
        help="Los agentes la generan desde la etiqueta; una persona puede ajustarla al crear."
      >
        <input
          required
          value={slug}
          onChange={(event) => {
            setSlugTouched(true);
            setSlug(slugifyLocation(event.target.value));
          }}
          className={INPUT}
        />
      </FormField>
      <TitleAndDescription
        title={title}
        description={description}
        onTitle={setTitle}
        onDescription={setDescription}
      />
      <ActionError error={error} />
      <div className="mt-6 flex gap-2">
        <button type="submit" disabled={pending} className={PRIMARY}>
          {pending ? "Guardando…" : "Crear"}
        </button>
        <CancelLink disabled={pending} />
      </div>
    </form>
  );
}

export function LocationEditor({
  location,
  redirects,
}: {
  location: ContentLocationWithUsage;
  redirects: string[];
}) {
  return (
    <div className="max-w-[640px]">
      <DetailsForm location={location} />
      <AddressForm location={location} redirects={redirects} />
      <RetireSection location={location} />
    </div>
  );
}

function DetailsForm({ location }: { location: ContentLocationWithUsage }) {
  const router = useRouter();
  const { pending, error, run } = useSave();
  const [saved, setSaved] = useState(false);
  const [label, setLabel] = useState(location.label);
  const [title, setTitle] = useState(location.title);
  const [description, setDescription] = useState(location.description);

  return (
    <form
      onChange={() => setSaved(false)}
      onSubmit={(event) => {
        event.preventDefault();
        run(
          () =>
            updateLocationAction({
              id: location.id,
              expectedLockVersion: location.lockVersion,
              patch: { label, title, description },
            }),
          () => {
            setSaved(true);
            router.refresh();
          },
        );
      }}
    >
      <FormField
        label="Etiqueta"
        help="El nombre corto que aparece en chips y listados."
      >
        <input
          required
          maxLength={80}
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          className={INPUT}
        />
      </FormField>
      <TitleAndDescription
        title={title}
        description={description}
        onTitle={setTitle}
        onDescription={setDescription}
      />
      <ActionError error={error} />
      <div className="mt-6 flex items-center gap-4">
        <button type="submit" disabled={pending} className={PRIMARY}>
          {pending ? "Guardando…" : "Guardar"}
        </button>
        {saved && !pending && (
          <span role="status" className="font-mono text-[12px] text-ok">
            Guardado.
          </span>
        )}
        <CancelLink disabled={pending}>Volver</CancelLink>
      </div>
    </form>
  );
}

function AddressForm({
  location,
  redirects,
}: {
  location: ContentLocationWithUsage;
  redirects: string[];
}) {
  const router = useRouter();
  const { pending, error, run } = useSave();
  const [slug, setSlug] = useState(location.slug);
  const [saved, setSaved] = useState(false);

  return (
    <Section title="Dirección">
      <p className="m-0 font-mono text-[13px] leading-[1.6] text-muted">
        La dirección anterior seguirá funcionando con una redirección
        permanente. Esta operación está reservada a personas.
      </p>
      <form
        className="mt-5"
        onSubmit={(event) => {
          event.preventDefault();
          run(
            () =>
              renameLocationAction({
                id: location.id,
                expectedLockVersion: location.lockVersion,
                slug,
              }),
            () => {
              setSaved(true);
              router.refresh();
            },
          );
        }}
      >
        <FormField label="Dirección actual" help={`/ubicacion/${slug || "…"}`}>
          <input
            required
            value={slug}
            onChange={(event) => {
              setSaved(false);
              setSlug(slugifyLocation(event.target.value));
            }}
            className={INPUT}
          />
        </FormField>
        {redirects.length > 0 && (
          <p className="mt-3 mb-0 font-mono text-[12px] leading-[1.6] break-all text-muted">
            Redirigen aquí:{" "}
            {redirects.map((from) => `/ubicacion/${from}`).join(", ")}
          </p>
        )}
        <ActionError error={error} />
        <div className="mt-6 flex items-center gap-4">
          <button
            type="submit"
            disabled={pending || slug === location.slug}
            className={SECONDARY}
          >
            {pending ? "Cambiando…" : "Cambiar y redirigir"}
          </button>
          {saved && !pending && (
            <span role="status" className="font-mono text-[12px] text-ok">
              Dirección cambiada y redirección creada.
            </span>
          )}
        </div>
      </form>
    </Section>
  );
}

function RetireSection({ location }: { location: ContentLocationWithUsage }) {
  const router = useRouter();
  const { pending, error, run } = useSave();
  const [confirming, setConfirming] = useState(false);
  const blocked = location.usageCount > 0;

  return (
    <Section title="Eliminar">
      <p className="m-0 font-mono text-[13px] leading-[1.6] text-muted">
        Se retirará <strong className="text-ink">{location.label}</strong> de
        las opciones y del sitio. Sólo se permite cuando ninguna revisión activa
        la usa.
      </p>
      {blocked && (
        <div className="mt-5 border border-line bg-card p-4">
          <p className="m-0 font-mono text-[12px] tracking-label-wide text-[var(--vendor-ochre)] uppercase">
            En uso en {location.usageCount}{" "}
            {location.usageCount === 1 ? "página" : "páginas"}
          </p>
          <ul className="mt-3 mb-0 list-none space-y-3 p-0">
            {location.usage?.map((page) => (
              <li key={page.id}>
                <p className="m-0 text-[14px] font-semibold text-ink">
                  {page.title}
                </p>
                <p className="mt-1 mb-0 font-mono text-[12px] break-all text-muted">
                  /{page.section}/{page.slug} · {page.status}
                </p>
              </li>
            ))}
          </ul>
          <p className="mt-4 mb-0 font-mono text-[12px] leading-[1.6] text-muted">
            Quita esta ubicación de esas revisiones antes de eliminarla.
          </p>
        </div>
      )}
      <ActionError error={error} />
      {/* Two steps, because this sits on the same page as an ordinary Save
          button and a stray click should not be the whole decision. */}
      <div className="mt-6 flex flex-wrap items-center gap-2">
        {confirming ? (
          <>
            <button
              type="button"
              disabled={pending || blocked}
              onClick={() =>
                run(
                  () =>
                    retireLocationAction({
                      id: location.id,
                      expectedLockVersion: location.lockVersion,
                    }),
                  () => router.push("/cms/locations?aviso=eliminada"),
                )
              }
              className={DANGER_SOLID}
            >
              {pending ? "Eliminando…" : `Sí, eliminar ${location.label}`}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => setConfirming(false)}
              className="cursor-pointer px-3 py-2 font-mono text-micro tracking-label-wide text-muted uppercase transition-colors hover:text-accent disabled:opacity-45"
            >
              Cancelar
            </button>
          </>
        ) : (
          <button
            type="button"
            disabled={blocked}
            onClick={() => setConfirming(true)}
            className={DANGER}
          >
            Eliminar ubicación
          </button>
        )}
      </div>
    </Section>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-12 border-t border-line pt-6">
      <h2 className="m-0 mb-4 font-display text-[20px] font-semibold tracking-[-0.015em]">
        {title}
      </h2>
      {children}
    </section>
  );
}

function TitleAndDescription({
  title,
  description,
  onTitle,
  onDescription,
}: {
  title: string;
  description: string;
  onTitle: (value: string) => void;
  onDescription: (value: string) => void;
}) {
  return (
    <>
      <FormField
        label="Título"
        help="El título principal de la página de ubicación."
      >
        <input
          required
          maxLength={180}
          value={title}
          onChange={(event) => onTitle(event.target.value)}
          className={INPUT}
        />
      </FormField>
      <FormField
        label="Descripción"
        help="Una frase precisa para lectores y buscadores."
      >
        <textarea
          required
          maxLength={220}
          rows={3}
          value={description}
          onChange={(event) => onDescription(event.target.value)}
          className={cn(INPUT, "resize-y")}
        />
      </FormField>
    </>
  );
}

function CancelLink({
  disabled,
  children = "Cancelar",
}: {
  disabled: boolean;
  children?: React.ReactNode;
}) {
  return (
    <Link
      href="/cms/locations"
      aria-disabled={disabled}
      className={cn(
        "ml-auto px-3 py-2 font-mono text-micro tracking-label-wide text-muted uppercase no-underline transition-colors hover:text-accent",
        disabled && "pointer-events-none opacity-45",
      )}
    >
      {children}
    </Link>
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
      className="mt-5 mb-0 border-l-2 border-[var(--vendor-ochre)] py-2 pl-4 font-mono text-[13px] text-ink"
    >
      {error}
    </p>
  ) : null;
}

const INPUT =
  "w-full border border-line bg-paper px-3 py-2 font-mono text-[13.5px] text-ink placeholder:text-muted focus:border-accent focus:outline-none";
const PRIMARY =
  "cursor-pointer border border-accent bg-accent px-3 py-2 font-mono text-micro tracking-label-wide text-paper uppercase transition-colors hover:border-ink hover:bg-ink disabled:cursor-not-allowed disabled:opacity-45";
const SECONDARY =
  "cursor-pointer border border-line px-3 py-2 font-mono text-micro tracking-label-wide text-ink uppercase transition-colors hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-45";
const DANGER =
  "cursor-pointer border border-[var(--vendor-ochre)] px-3 py-2 font-mono text-micro tracking-label-wide text-[var(--vendor-ochre)] uppercase transition-colors hover:bg-[var(--vendor-ochre)] hover:text-paper disabled:cursor-not-allowed disabled:opacity-45";
const DANGER_SOLID =
  "cursor-pointer border border-[var(--vendor-ochre)] bg-[var(--vendor-ochre)] px-3 py-2 font-mono text-micro tracking-label-wide text-paper uppercase transition-colors hover:border-ink hover:bg-ink disabled:cursor-not-allowed disabled:opacity-45";

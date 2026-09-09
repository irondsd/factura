"use client";

import { Check, Copy, X } from "lucide-react";
import { useId, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { FigureAttribution } from "./FigureAttribution";
import { embedPath } from "./embedPaths";

type EmbedSection = "estadisticas" | "investigaciones";

function htmlAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function serializableProps(
  props: Record<string, unknown>,
): Record<string, string | number | boolean> {
  return Object.fromEntries(
    Object.entries(props).filter(
      (entry): entry is [string, string | number | boolean] =>
        ["string", "number", "boolean"].includes(typeof entry[1]),
    ),
  );
}

export function buildEmbedCode({
  origin,
  sourceHref,
  section,
  componentName,
  componentProps,
  title,
  height,
}: {
  origin: string;
  sourceHref: string;
  section: EmbedSection;
  componentName: string;
  componentProps: Record<string, unknown>;
  title: string;
  height: number;
}): string {
  const articleSlug = sourceHref.replace(`/${section}/`, "");
  const url = new URL(
    embedPath({ section, componentName, articleSlug }),
    origin,
  );
  const props = serializableProps(componentProps);
  if (Object.keys(props).length > 0) {
    url.searchParams.set("props", JSON.stringify(props));
  }

  return `<iframe title="${htmlAttribute(title)} — Factura" src="${htmlAttribute(url.toString())}" width="100%" height="${height}" style="border:0" loading="lazy"></iframe>`;
}

export function EmbedFigureControls({
  sourceHref,
  section,
  componentName,
  componentProps,
  title,
}: {
  sourceHref: string;
  section: EmbedSection;
  componentName: string;
  componentProps: Record<string, unknown>;
  title: string;
}) {
  const id = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  const [code, setCode] = useState("");
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">(
    "idle",
  );

  function openDialog() {
    const figure = dialogRef.current?.closest<HTMLElement>(
      "[data-embed-figure]",
    );
    const measuredHeight = figure?.getBoundingClientRect().height ?? 560;
    setCode(
      buildEmbedCode({
        origin: window.location.origin,
        sourceHref,
        section,
        componentName,
        componentProps,
        title,
        height: Math.max(420, Math.ceil(measuredHeight + 32)),
      }),
    );
    setCopyState("idle");
    dialogRef.current?.showModal();
    requestAnimationFrame(() => codeRef.current?.select());
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(code);
      setCopyState("copied");
    } catch {
      setCopyState("error");
      codeRef.current?.focus();
      codeRef.current?.select();
    }
  }

  return (
    <>
      <FigureAttribution
        sourceHref={sourceHref}
        action={
          <button
            type="button"
            onClick={openDialog}
            className="-my-2 inline-flex min-h-11 items-center text-accent underline decoration-dotted underline-offset-4 transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Insertar visualización
          </button>
        }
      />

      <dialog
        ref={dialogRef}
        aria-labelledby={`${id}-title`}
        onClose={() => setCopyState("idle")}
        onClick={(event) => {
          if (event.target === event.currentTarget) event.currentTarget.close();
        }}
        className="fixed inset-0 m-auto w-[min(620px,calc(100%-2rem))] max-w-none border border-line bg-card p-0 text-ink shadow-pop backdrop:bg-ink/45"
      >
        <div className="p-5 sm:p-6">
          <div className="flex items-start justify-between gap-5">
            <div>
              <p className="fd-label m-0 text-accent">Compartir datos</p>
              <h2
                id={`${id}-title`}
                className="mt-2 font-display text-2xl font-semibold leading-tight tracking-tight"
              >
                Insertar esta visualización
              </h2>
            </div>
            <form method="dialog">
              <Button
                type="submit"
                variant="icon"
                size="xl"
                aria-label="Cerrar"
                className="-mt-2 -mr-2 min-h-11 min-w-11"
              >
                <X aria-hidden="true" size={20} strokeWidth={1.8} />
              </Button>
            </form>
          </div>

          <p className="mt-3 max-w-[52ch] font-mono text-xs leading-relaxed text-muted">
            Copiá y pegá este código en el HTML de tu sitio. La visualización se
            mantendrá actualizada y conservará el enlace a la fuente.
          </p>

          <label htmlFor={`${id}-code`} className="fd-label mt-5 block">
            Código de inserción
          </label>
          <div className="mt-2 flex border border-line bg-paper focus-within:border-accent">
            <input
              ref={codeRef}
              id={`${id}-code`}
              readOnly
              value={code}
              onFocus={(event) => event.currentTarget.select()}
              className="min-w-0 flex-1 bg-transparent px-3 py-3 font-mono text-xs text-ink focus:outline-none"
            />
            <button
              type="button"
              onClick={copyCode}
              className="inline-flex min-h-11 min-w-12 items-center justify-center border-l border-line bg-ink text-paper transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-paper"
              aria-label={
                copyState === "copied" ? "Código copiado" : "Copiar código"
              }
            >
              {copyState === "copied" ? (
                <Check aria-hidden="true" size={19} />
              ) : (
                <Copy aria-hidden="true" size={18} />
              )}
            </button>
          </div>
          <p
            aria-live="polite"
            className={`mt-2 min-h-5 font-mono text-micro ${
              copyState === "error" ? "text-accent" : "text-muted"
            }`}
          >
            {copyState === "copied"
              ? "Código copiado."
              : copyState === "error"
                ? "No se pudo copiar automáticamente. El código quedó seleccionado."
                : "Ancho adaptable al sitio donde se inserte."}
          </p>
        </div>
      </dialog>
    </>
  );
}

import type { Diagnostic } from "@/content-system/types";
import { cn } from "@/lib/cn";

// The Validation tab. Warnings never disappear silently (cms.md): they are listed
// beside the errors, marked as advisory, and they do not block publication.
//
// It is also where a save says what it could not say by refusing. Saving is
// never blocked — a working copy is private, and unfinished work is what it is
// for — so everything that stands between this page and «Publicar» is reported
// here instead, and this panel comes forward on its own when a save leaves
// something in it.

/** The gate a set of diagnostics was produced by. Named here because the panel
 * is what tells the editor which question was asked — a draft that "has no
 * problems" has only been checked for grammar unless it says otherwise. */
export type ValidationLevel = "draft" | "preview" | "publish";

const REQUIREMENT: Record<ValidationLevel, string> = {
  draft: "guardar un borrador",
  preview: "una vista previa",
  publish: "publicar",
};

export function ValidationPanel({
  diagnostics,
  level,
}: {
  diagnostics: readonly Diagnostic[];
  /** Null until something has actually been checked. */
  level: ValidationLevel | null;
}) {
  const errors = diagnostics.filter((d) => d.severity === "error");
  const warnings = diagnostics.filter((d) => d.severity === "warning");

  if (!level) {
    return (
      <Empty>
        Guarda o pulsa «Validar» para ver qué le falta a esta página.
      </Empty>
    );
  }

  if (diagnostics.length === 0) {
    return (
      <Empty>
        Sin problemas. La página cumple lo que hace falta para{" "}
        {REQUIREMENT[level]}.
      </Empty>
    );
  }

  return (
    <div>
      <p className="font-mono text-[13px] leading-[1.6] text-muted mb-4">
        {errors.length} {errors.length === 1 ? "error" : "errores"} ·{" "}
        {warnings.length} {warnings.length === 1 ? "aviso" : "avisos"} para{" "}
        {REQUIREMENT[level]}.{" "}
        {errors.length > 0
          ? "Los errores impiden publicar; los avisos no. Guardar funciona igual."
          : "Los avisos no impiden publicar."}
      </p>
      <ul className="list-none p-0 m-0">
        {[...errors, ...warnings].map((diagnostic, index) => (
          <li
            // Diagnostics have no id; the code plus position plus index is
            // stable within one result.
            key={`${diagnostic.code}-${diagnostic.line ?? "x"}-${index}`}
            className="border-l-2 pl-4 py-2 mb-2"
            style={{
              borderColor:
                diagnostic.severity === "error"
                  ? "var(--accent)"
                  : "var(--vendor-ochre)",
            }}
          >
            <p className="font-mono text-[13px] leading-[1.6] text-ink m-0">
              <span
                className={cn(
                  "font-mono text-[10px] uppercase tracking-label-wide mr-2",
                  diagnostic.severity === "error"
                    ? "text-accent"
                    : "text-[var(--vendor-ochre)]",
                )}
              >
                {diagnostic.severity === "error" ? "Error" : "Aviso"}
              </span>
              {diagnostic.message}
            </p>
            <p className="font-mono text-[11px] text-muted mt-1 mb-0">
              {diagnostic.line !== undefined
                ? `Línea ${diagnostic.line}${diagnostic.column !== undefined ? `, columna ${diagnostic.column}` : ""}`
                : (diagnostic.field ?? "Metadatos")}
              <span className="opacity-60"> · {diagnostic.code}</span>
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-mono text-[13px] leading-[1.7] text-muted border border-line border-dashed px-5 py-8 text-center">
      {children}
    </p>
  );
}

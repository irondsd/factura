import type { Diagnostic } from "@/content-system/types";
import { cn } from "@/lib/cn";

// The Validation tab. Warnings never disappear silently (§5.3): they are listed
// beside the errors, marked as advisory, and they do not block publication.

export function ValidationPanel({
  diagnostics,
  checked,
  level,
}: {
  diagnostics: readonly Diagnostic[];
  checked: boolean;
  level: string;
}) {
  const errors = diagnostics.filter((d) => d.severity === "error");
  const warnings = diagnostics.filter((d) => d.severity === "warning");

  if (!checked) {
    return (
      <Empty>
        Guarda o pulsa «Revisar» para ver el resultado de la revisión.
      </Empty>
    );
  }

  if (diagnostics.length === 0) {
    return (
      <Empty>
        Sin problemas. La página cumple lo que hace falta para {level}.
      </Empty>
    );
  }

  return (
    <div>
      <p className="font-mono text-[13px] text-muted mb-4">
        {errors.length} {errors.length === 1 ? "error" : "errores"} ·{" "}
        {warnings.length} {warnings.length === 1 ? "aviso" : "avisos"}. Los
        avisos no impiden publicar.
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

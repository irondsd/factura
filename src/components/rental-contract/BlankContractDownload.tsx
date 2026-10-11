"use client";

import { useEffect, useState } from "react";
import type { ContractType } from "@/lib/rental-contract/model";

/** The blank template for people who fill the contract in by hand. Built in the
 * browser like the filled one, so the PDF libraries load only on click. */
export function BlankContractDownload({
  type,
  className,
}: {
  type: ContractType;
  className?: string;
}) {
  const [state, setState] = useState<"idle" | "working" | "failed">("idle");
  const [url, setUrl] = useState<string | null>(null);
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );

  async function download() {
    setState("working");
    try {
      let href = url;
      if (!href) {
        const { generateBlankContractPdf } = await import(
          "@/lib/rental-contract/pdf"
        );
        const bytes = await generateBlankContractPdf(type);
        href = URL.createObjectURL(
          new Blob([bytes], { type: "application/pdf" }),
        );
        setUrl(href);
      }
      const link = document.createElement("a");
      link.href = href;
      link.download = `contrato-alquiler-${type}-en-blanco.pdf`;
      link.click();
      setState("idle");
    } catch {
      setState("failed");
    }
  }

  return (
    <div className={className}>
      <button
        type="button"
        onClick={download}
        disabled={state === "working"}
        className="inline-flex items-center justify-center border border-line bg-card px-5 py-3 font-mono text-[13px] text-ink transition-colors hover:border-ink disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
      >
        {state === "working"
          ? "Preparando el PDF…"
          : "Descargar el modelo en blanco"}
      </button>
      {state === "failed" && (
        <p role="alert" className="mt-2 font-mono text-[12px] text-accent">
          No pudimos generar el PDF. Revisá tu conexión y volvé a intentarlo.
        </p>
      )}
    </div>
  );
}

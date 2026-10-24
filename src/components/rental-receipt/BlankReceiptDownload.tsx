"use client";

import { useEffect, useState } from "react";
import { receiptEvent } from "./analytics";
import styles from "./receipt.module.css";

export function BlankReceiptDownload() {
  const [state, setState] = useState<"idle" | "working" | "failed">("idle");
  const [url, setUrl] = useState<string | null>(null);
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );

  async function download() {
    if (state === "working") return;
    setState("working");
    try {
      let href = url;
      if (!href) {
        const { generateReceiptPdf } = await import("@/lib/rental-receipt/pdf");
        href = URL.createObjectURL(
          new Blob([await generateReceiptPdf()], { type: "application/pdf" }),
        );
        setUrl(href);
      }
      const link = document.createElement("a");
      link.href = href;
      link.download = "recibo-alquiler-en-blanco.pdf";
      link.click();
      receiptEvent("blank_downloaded");
      setState("idle");
    } catch {
      setState("failed");
      receiptEvent("pdf_failed");
    }
  }

  return (
    <div>
      <button
        type="button"
        className={styles.download}
        onClick={download}
        disabled={state === "working"}
      >
        {state === "working"
          ? "Preparando el PDF…"
          : "Descargar modelo en blanco"}
      </button>
      {state === "failed" && (
        <p role="alert" className={styles.error}>
          No pudimos generar el PDF. Revisá tu conexión y volvé a intentarlo.
        </p>
      )}
    </div>
  );
}

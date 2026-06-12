"use client";

import { useCallback, useRef, useState } from "react";

type ParsedBill = {
  id: string;
  name: string;
  size: number;
  droppedAt: string;
  status: "parsing" | "done" | "error";
  text?: string;
  error?: string;
};

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function Home() {
  const [bills, setBills] = useState<ParsedBill[]>([]);
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(async (files: Iterable<File>) => {
    for (const file of files) {
      const id = crypto.randomUUID();
      const entry: ParsedBill = {
        id,
        name: file.name,
        size: file.size,
        droppedAt: new Date().toLocaleTimeString(),
        status: "parsing",
      };
      setBills((prev) => [entry, ...prev]);

      const isPdf =
        file.type === "application/pdf" ||
        file.name.toLowerCase().endsWith(".pdf");
      if (!isPdf) {
        setBills((prev) =>
          prev.map((b) =>
            b.id === id
              ? { ...b, status: "error", error: "Not a PDF file." }
              : b,
          ),
        );
        continue;
      }

      try {
        const { default: pdfToText } = await import("react-pdftotext");
        const text = await pdfToText(file);
        setBills((prev) =>
          prev.map((b) => (b.id === id ? { ...b, status: "done", text } : b)),
        );
      } catch (err) {
        setBills((prev) =>
          prev.map((b) =>
            b.id === id
              ? {
                  ...b,
                  status: "error",
                  error: err instanceof Error ? err.message : String(err),
                }
              : b,
          ),
        );
      }
    }
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      dragDepth.current = 0;
      setDragging(false);
      handleFiles(e.dataTransfer.files);
    },
    [handleFiles],
  );

  return (
    <div className="flex flex-1 flex-col items-center px-4 py-12 sm:py-16">
      <main className="w-full max-w-2xl">
        <p className="text-[11px] uppercase tracking-[0.3em] text-muted">
          Factura · utility bill parser · iteration 01
        </p>
        <h1 className="mt-3 font-display text-5xl font-semibold tracking-tight sm:text-6xl">
          Drop a bill.
          <br />
          Read it back.
        </h1>
        <p className="mt-4 max-w-md text-sm leading-6 text-muted">
          Electric, gas, water — toss the PDF below and see what text we can
          pull out of it. Parsing happens entirely in your browser.
        </p>

        <div
          role="button"
          tabIndex={0}
          aria-label="Drop a PDF bill here or press Enter to browse"
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
          }}
          onDragEnter={(e) => {
            e.preventDefault();
            dragDepth.current += 1;
            setDragging(true);
          }}
          onDragLeave={() => {
            dragDepth.current -= 1;
            if (dragDepth.current <= 0) setDragging(false);
          }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDrop}
          className={`mt-10 flex cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed px-6 py-16 text-center transition-all duration-150 outline-none focus-visible:ring-2 focus-visible:ring-accent ${
            dragging
              ? "scale-[1.01] border-accent bg-accent/5"
              : "border-ink/30 bg-card/60 hover:border-ink/60"
          }`}
        >
          <svg
            width="36"
            height="44"
            viewBox="0 0 36 44"
            fill="none"
            aria-hidden="true"
            className={dragging ? "text-accent" : "text-ink/70"}
          >
            <path
              d="M2 2h22l10 10v30H2V2Z"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinejoin="round"
            />
            <path
              d="M24 2v10h10"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinejoin="round"
            />
            <path
              d="M9 22h18M9 28h18M9 34h12"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
          </svg>
          <p className="text-sm font-medium">
            {dragging ? "Let go — we’ve got it" : "Drop your PDF bill here"}
          </p>
          <p className="text-xs text-muted">or click to browse · multiple files welcome</p>
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files) handleFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>

        <section className="mt-12 flex flex-col gap-8">
          {bills.map((bill, i) => (
            <article
              key={bill.id}
              className="receipt-edge border border-line bg-card pb-8 shadow-[0_1px_0_var(--line),0_8px_24px_-12px_rgb(33_29_22/0.25)]"
            >
              <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-dashed border-line px-5 py-4">
                <span className="text-xs text-accent">
                  №{String(bills.length - i).padStart(3, "0")}
                </span>
                <h2 className="min-w-0 flex-1 truncate text-sm font-semibold">
                  {bill.name}
                </h2>
                <div className="flex items-center gap-3 text-[11px] uppercase tracking-wider text-muted">
                  {bill.status === "done" && bill.text !== undefined && (
                    <button
                      onClick={() => navigator.clipboard.writeText(bill.text!)}
                      className="cursor-pointer underline decoration-dotted underline-offset-4 hover:text-accent"
                    >
                      Copy
                    </button>
                  )}
                  <button
                    onClick={() =>
                      setBills((prev) => prev.filter((b) => b.id !== bill.id))
                    }
                    aria-label={`Remove ${bill.name}`}
                    className="cursor-pointer hover:text-accent"
                  >
                    ✕
                  </button>
                </div>
              </header>

              <p className="px-5 pt-3 text-[11px] uppercase tracking-wider text-muted">
                {formatSize(bill.size)} · dropped {bill.droppedAt}
                {bill.status === "done" &&
                  ` · ${bill.text!.length.toLocaleString()} chars`}
              </p>

              {bill.status === "parsing" && (
                <p className="animate-pulse px-5 py-6 text-sm text-muted">
                  Reading the fine print…
                </p>
              )}

              {bill.status === "error" && (
                <p className="px-5 py-6 text-sm text-accent">
                  Couldn’t parse this one: {bill.error}
                </p>
              )}

              {bill.status === "done" && (
                <pre className="ruled mx-5 mt-3 max-h-96 overflow-auto whitespace-pre-wrap font-mono text-[13px]">
                  {bill.text!.trim() === ""
                    ? "(no text found — this PDF may be a scanned image)"
                    : bill.text}
                </pre>
              )}
            </article>
          ))}
        </section>

        <footer className="mt-16 border-t border-line pt-4 text-[11px] uppercase tracking-wider text-muted">
          Files never leave this page — parsed locally with pdf.js
        </footer>
      </main>
    </div>
  );
}

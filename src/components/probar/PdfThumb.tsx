"use client";

import { useEffect, useRef, useState } from "react";
import { TextPreview } from "./TextPreview";

/** First-page preview, rendered in the browser from the File the visitor just
 * dropped — no download, no server round trip.
 *
 * `pdfjs-serverless` is already a dependency (the server extracts text with it)
 * and it ships the full pdf.js display layer, so this adds nothing to
 * package.json. It's imported lazily, so the chunk is fetched only on this route
 * and only once a file is actually dropped — the landing page never pays for it.
 *
 * The alternatives were both worse. Rasterizing server-side needs a
 * CanvasRenderingContext2D, which Node doesn't have and pdf.js requires (its SVG
 * backend was removed in v4), so it would mean a native @napi-rs/canvas in the
 * serverless bundle plus per-file server CPU. `<iframe src={blobUrl}>` is
 * dependency-free and fine on desktop and iOS Safari, but Android Chrome renders
 * a download placeholder instead of the page.
 *
 * On any failure — render error, missing canvas support, chunk that won't load —
 * it falls back to the text preview, so there is no path that shows nothing. */
export function PdfThumb({
  file,
  text,
  height,
}: {
  file: File;
  /** Fallback content: the text we extracted from this same PDF. */
  text: string;
  height: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [failed, setFailed] = useState(false);
  const [rendered, setRendered] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { getDocument } = await import("pdfjs-serverless");
        const bytes = new Uint8Array(await file.arrayBuffer());
        const doc = await getDocument({
          data: bytes,
          useSystemFonts: true,
        }).promise;
        const page = await doc.getPage(1);

        const canvas = canvasRef.current;
        if (cancelled || !canvas) return;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("no 2d context");

        // Fit the page to the requested height, then oversample for crisp text
        // on high-DPI screens (capped, since this is a thumbnail).
        const base = page.getViewport({ scale: 1 });
        const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
        const viewport = page.getViewport({ scale: (height / base.height) * dpr });
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        canvas.style.height = `${height}px`;
        canvas.style.width = `${Math.floor(viewport.width / dpr)}px`;

        await page.render({ canvasContext: context, viewport, canvas }).promise;
        await doc.destroy();
        if (!cancelled) setRendered(true);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [file, height]);

  if (failed) return <TextPreview text={text} compact />;

  return (
    <div
      className="receipt-edge bg-card border border-line flex items-start justify-center overflow-hidden"
      style={{ height }}
    >
      <canvas
        ref={canvasRef}
        aria-label={file.name}
        className={rendered ? "block" : "invisible"}
      />
    </div>
  );
}

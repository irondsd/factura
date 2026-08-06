"use client";

import { useState } from "react";
import { Button, microLabel } from "@/components/ui";
import { interpolate } from "@/i18n/config";
import { useI18n } from "@/i18n/I18nProvider";
import { Modal } from "./Modal";

/** The text we pulled out of the PDF, in a dialog.
 *
 * It's the proof the whole page rests on — "we really opened your file, here is
 * what we saw" — but it's also a wall of raw text, and inlining it under every
 * card buries the extracted fields that are the actual result. So it lives one
 * click away, from a link on the card, and gets the room to be read when opened.
 *
 * Only the preview slice reaches the browser (`TEXT_PREVIEW_CHARS`), so a long
 * bill says so rather than pretending the document ends there. */
export function ExtractedTextDialog({
  fileName,
  text,
  pages,
  chars,
  truncated,
  onClose,
}: {
  fileName: string;
  text: string;
  pages: number;
  chars: number;
  /** Extraction stopped at the page cap — the text itself is partial. */
  truncated: boolean;
  onClose: () => void;
}) {
  const { t, locale } = useI18n();
  const p = t.probar;
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      // No clipboard permission (or no clipboard): the text is selectable right
      // there, so there is nothing worth interrupting the reader about.
    }
  };

  // Two different partial-ness stories, and the visitor only cares that what
  // they're reading isn't all of it.
  const partial = truncated || text.length < chars;

  return (
    <Modal
      title={p.whatWeSaw}
      subtitle={`${fileName} · ${interpolate(p.whatWeSawHelp, {
        pages,
        chars: chars.toLocaleString(locale),
      })}`}
      onClose={onClose}
      width={720}
    >
      {/* No `leading-*` here on purpose: `.ruled` owns the line height, and any
          utility that changes it would slide the text off the ruling. */}
      <pre className="ruled max-h-[52vh] overflow-auto border border-line bg-paper p-3.5 font-mono text-[10.5px] whitespace-pre-wrap break-words text-ink/80">
        {text}
      </pre>
      <div className="flex flex-wrap items-center gap-4">
        <Button type="button" variant="link" onClick={() => void copy()}>
          {copied ? p.copiedText : p.copyText}
        </Button>
        {partial && <span className={microLabel}>{p.truncated}</span>}
      </div>
    </Modal>
  );
}

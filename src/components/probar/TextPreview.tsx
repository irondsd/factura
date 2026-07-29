"use client";

import { microLabel } from "@/components/ui";
import { interpolate } from "@/i18n/config";
import { useI18n } from "@/i18n/I18nProvider";

/** The text we actually pulled out of the PDF, in the product's receipt voice.
 *
 * Does double duty: it's the "here's what we read" panel on a bill we couldn't
 * parse — which turns a dead end into evidence that we really opened the file —
 * and it's PdfThumb's fallback when the page can't be rasterized. Either way the
 * visitor sees something real rather than an empty box. */
export function TextPreview({
  text,
  pages,
  chars,
  truncated,
  compact,
}: {
  text: string;
  pages?: number;
  chars?: number;
  truncated?: boolean;
  compact?: boolean;
}) {
  const { t } = useI18n();
  const p = t.probar;

  return (
    <div className="flex flex-col gap-1.5">
      <span className={microLabel}>{p.whatWeSaw}</span>
      <pre
        className={`receipt-edge bg-card border border-line overflow-hidden whitespace-pre-wrap break-words font-mono text-ink/80 leading-[1.7] ${
          compact
            ? "max-h-[120px] p-2.5 text-[9.5px]"
            : "max-h-[260px] p-3.5 text-[10.5px]"
        }`}
      >
        {text}
      </pre>
      {pages !== undefined && chars !== undefined && (
        <span className={microLabel}>
          {interpolate(p.whatWeSawHelp, {
            pages,
            chars: chars.toLocaleString(),
          })}
          {truncated ? ` · ${p.truncated}` : ""}
        </span>
      )}
    </div>
  );
}

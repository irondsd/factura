import {
  matchOrThrow,
  monthOf,
  parseAmountAR,
  parseDateDMY,
  parseSpanishMonth,
} from "./helpers";
import type { VendorParser } from "./types";

/**
 * Expensas — the consorcio cupón/recibo layout. AR format.
 * Detection is format-based, not administrator-based: administrators change
 * (MDA today, Cantarelli before) but print the same documents and, crucially,
 * the same consorcio. Covers both the payment cupón ("Cupón de pago") and the
 * post-payment receipt ("Recibo de Pago") — same charges, same line items.
 * Expensas bills print no client number; the stable account key is
 * `consorcioCUIT:unit` (e.g. "30-53393827-9:4A"), so bills from different
 * administrators of the same building share one account/history.
 */
export const mdaExpensasParser: VendorParser = {
  key: "mda-expensas",
  vendorSlug: "mda-expensas",
  version: 4,

  detect(text) {
    return (
      /(Cup[óo]n de pago|Recibo de Pago)/i.test(text) &&
      /CONSORCIO DE PROPIETARIOS/i.test(text) &&
      /Expensas/i.test(text)
    );
  },

  parse(text) {
    const cuit = matchOrThrow(
      text,
      /CONSORCIO DE PROPIETARIOS.*?CUIT:\s*([\d-]{12,13})/i,
      "consorcio CUIT",
    )[1];

    // Unit spelling varies by administrator: "4° A" vs "04-A". It must be
    // anchored to the UF code ("009 04-A") or "Copia Consorcista" header —
    // an unanchored search can hit the administrator's own office address
    // (e.g. "MEDRANO 46 - 4° B, CABA"), which appears earlier in the text.
    const unitMatch =
      text.match(
        /(?:\b\d{3}\s+|Consorcista\s+)(\d{1,3})\s*(?:[°º]\s*|-)([A-Z])\b/,
      ) ??
      matchOrThrow(
        text,
        /\b(\d{1,3})\s*(?:[°º]\s*|-)([A-Z])\b/,
        "unit (e.g. 4° A or 04-A)",
      );
    const unit = `${Number(unitMatch[1])}${unitMatch[2]}`;

    const venc = matchOrThrow(
      text,
      /1er Vencimiento\s+(\d{2}\/\d{2}\/\d{4})\s+\$\s*([\d.,]+)/i,
      "1er vencimiento",
    );
    const dueDate = parseDateDMY(venc[1]);
    const totalAmount = parseAmountAR(venc[2]);

    const extraordinarias = text.match(
      /Expensas Extraordinarias[^$]*\$\s*([\d.,]+)/i,
    );

    const periodLabelMatch = text.match(
      /Vencimiento:\s*([A-Za-z]{3,12})\.?\s*(\d{4})/,
    );
    const period = periodLabelMatch
      ? parseSpanishMonth(periodLabelMatch[1], periodLabelMatch[2])
      : monthOf(dueDate);

    return {
      accountNumber: `${cuit}:${unit}`,
      period,
      periodLabel: periodLabelMatch
        ? `${periodLabelMatch[1]} ${periodLabelMatch[2]}`
        : undefined,
      totalAmount,
      dueDate,
      extraordinaryAmount: extraordinarias
        ? parseAmountAR(extraordinarias[1])
        : undefined,
    };
  },
};

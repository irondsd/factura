import {
  addMonths,
  matchOrThrow,
  monthOf,
  parseAmountAR,
  parseDateDMY,
} from "./helpers";
import { ParseError, type VendorParser } from "./types";

/**
 * Expensas — Dominijanni Propiedades (Consorcios en Red aviso). AR format.
 * The PDF embeds the FULL previous-month receipt below the current aviso, so
 * everything is extracted from the region above "RECIBO DE PAGO MES ANTERIOR".
 * Account key is `consorcioCUIT:unit` (unit = "Unidad: 0016").
 *
 * Period convention: the aviso doesn't print its own período, but the embedded
 * receipt does ("Período: Abril/2026" with "1º vto.: 15/05/2026"), which pins
 * it down: período = due month - 1. Expensas are billed in arrears.
 */
export const dominijanniExpensasParser: VendorParser = {
  key: "dominijanni-expensas",
  vendorSlug: "dominijanni-expensas",
  version: 2,

  detect(text) {
    return /DOMINIJANNI/i.test(text) && /EXPENSAS/i.test(text);
  },

  parse(fullText) {
    const text = fullText.split(/RECIBO DE PAGO MES ANTERIOR/i)[0];

    const cuit = matchOrThrow(
      text,
      /C\.U\.I\.T\.?\s*([\d-]{12,13})/,
      "consorcio CUIT",
    )[1];
    const unit = matchOrThrow(text, /Unidad:\s*(\d+)/i, "unit")[1];

    const totalAmount = parseAmountAR(
      matchOrThrow(text, /A pagar:\s*\$\s*([\d.,]+)/i, "total")[1],
    );
    const dueDate = parseDateDMY(
      matchOrThrow(text, /Vence:\s*(\d{2}\/\d{2}\/\d{4})/i, "due date")[1],
    );

    // Cross-check against the payment digit lines (one contains the amount in
    // cents and the due date as YYMMDD; the aviso also prints an unrelated
    // OMR line of 0/1/2 digits, so any matching line counts)
    const digitLines = [...text.matchAll(/\b\d{40,}\b/g)].map((m) => m[0]);
    if (digitLines.length > 0) {
      const cents = String(Math.round(totalAmount * 100));
      const yymmdd = dueDate.slice(2).replaceAll("-", "");
      const confirmed = digitLines.some(
        (line) => line.includes(cents) && line.includes(yymmdd),
      );
      if (!confirmed) {
        throw new ParseError(
          "No payment barcode line confirms the labeled values",
        );
      }
    }

    const cuotaExtra = text.match(/Cuota\s+Extra[^$]*\$\s*([\d.,]+)/i);
    const extraordinaryAmount = cuotaExtra
      ? parseAmountAR(cuotaExtra[1])
      : undefined;

    return {
      accountNumber: `${cuit}:${unit}`,
      period: addMonths(monthOf(dueDate), -1),
      totalAmount,
      dueDate,
      extraordinaryAmount:
        extraordinaryAmount && extraordinaryAmount > 0
          ? extraordinaryAmount
          : undefined,
    };
  },
};

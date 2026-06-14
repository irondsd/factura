import {
  matchOrThrow,
  monthOf,
  parseAmountAR,
  parseDateDMY,
} from "./helpers";
import { ParseError, type VendorParser } from "./types";

/**
 * Telecom internet. AR format. The "TOTAL A PAGAR" next to the payment stub is
 * masked ("$ **********") on auto-debit bills, so the labeled anchor is
 * "Tu saldo total es de $ X y vence el día D". The long digit line is used as
 * a containment cross-check (it embeds referente, amount in cents, due date).
 */
export const telecomParser: VendorParser = {
  key: "telecom",
  vendorSlug: "telecom",
  version: 1,

  detect(text) {
    return /TELECOM ARGENTINA S\.A\./i.test(text);
  },

  parse(text) {
    const accountNumber = matchOrThrow(
      text,
      /Referente de Pago:?\s*(\d{16})/i,
      "referente de pago",
    )[1];

    const saldo = matchOrThrow(
      text,
      /Tu saldo total es de\s*\$\s*([\d.,]+)\s*y vence el d[ií]a\s*(\d{2}\/\d{2}\/\d{4})/i,
      "saldo total + due date",
    );
    const totalAmount = parseAmountAR(saldo[1]);
    const dueDate = parseDateDMY(saldo[2]);

    // Cross-check against the payment digit lines when present
    const digitLines = [...text.matchAll(/\b\d{50,}\b/g)].map((m) => m[0]);
    if (digitLines.length > 0) {
      const cents = String(Math.round(totalAmount * 100));
      const yymmdd = dueDate.slice(2).replaceAll("-", "");
      const confirmed = digitLines.some(
        (line) =>
          line.includes(accountNumber) &&
          line.includes(cents) &&
          line.includes(yymmdd),
      );
      if (!confirmed) {
        throw new ParseError(
          "No payment barcode line confirms the labeled values",
        );
      }
    }

    const abono = text.match(/Periodo de Abono:\s*([^A-Z]{0,20}?\d{2}\/\d{2}(?: al \d{2}\/\d{2})?)/i);

    return {
      accountNumber,
      period: monthOf(dueDate),
      periodLabel: abono?.[1]?.trim(),
      totalAmount,
      dueDate,
    };
  },
};

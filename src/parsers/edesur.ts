import {
  assertAmountsAgree,
  matchOrThrow,
  parseAmountUS,
  parseDateDMY,
  parseDateYYMMDD,
} from "./helpers";
import { ParseError, type VendorParser } from "./types";

/**
 * Edesur electricity. The only US-number-format vendor (22,590.52).
 *
 * Labeled header ("1° Vencimiento: DD/MM/YYYY TOTAL: $ X") is the primary
 * source. When the 1D payment-barcode payload is present (58-digit line:
 *   009 | client(10) | cents(11) | due YYMMDD(6) | surcharge(9) | 2nd due(4) | tail(15)
 * ) it must agree with the labels — disagreement throws -> needs_review.
 * $0 bills (outage credits, migration installments) print no barcode at all.
 *
 * Periods come in two dialects:
 *  - monthly (Nov 2025+): "Periodo liquidado 5" — month number, year inferred
 *    from the due date;
 *  - bimonthly (before): "Periodo liquidado 1er/2do tramo del bim. 03/2025" —
 *    bimester 3 of 2025 covers May+June; tramo picks the half.
 */
export const edesurParser: VendorParser = {
  key: "edesur",
  vendorSlug: "edesur",
  version: 2,

  detect(text) {
    return /edesur/i.test(text);
  },

  parse(text) {
    const labelAccount = matchOrThrow(
      text,
      /Cliente:?\s*(\d{6,10})/,
      "client number",
    )[1].replace(/^0+/, "");

    const header = matchOrThrow(
      text,
      /1° ?\s*Vencimiento:\s*(\d{2}\/\d{2}\/\d{4})\s*TOTAL:\s*\$\s*([\d,.]+)/i,
      "1° vencimiento header",
    );
    let dueDate = parseDateDMY(header[1]);
    let totalAmount = parseAmountUS(header[2]);

    const barcode = text.match(
      /\b009(\d{10})(\d{11})(\d{6})(\d{9})(\d{4})(\d{15})\b/,
    );
    let lateSurcharge: number | undefined;
    if (barcode) {
      const accountFromBarcode = barcode[1].replace(/^0+/, "");
      if (accountFromBarcode !== labelAccount) {
        throw new ParseError(
          `Account mismatch: barcode ${accountFromBarcode}, label ${labelAccount}`,
        );
      }
      const barcodeAmount = Number(barcode[2]) / 100;
      assertAmountsAgree(barcodeAmount, totalAmount, "Total");
      const barcodeDue = parseDateYYMMDD(barcode[3]);
      if (barcodeDue !== dueDate) {
        throw new ParseError(
          `Due date mismatch: barcode ${barcodeDue}, label ${dueDate}`,
        );
      }
      totalAmount = barcodeAmount;
      dueDate = barcodeDue;
      lateSurcharge = Number(barcode[4]) / 100;
    }

    const { period, periodLabel } = derivePeriod(text, dueDate);

    const kwh = text.match(/Energ[ií]a Consumida\s+([\d,.]+)\s*kWh/i);

    return {
      accountNumber: labelAccount,
      period,
      periodLabel,
      totalAmount,
      dueDate,
      consumption: kwh
        ? { value: parseAmountUS(kwh[1]), unit: "kWh" }
        : undefined,
      extra: { lateSurcharge, noBarcode: !barcode || undefined },
    };
  },
};

function derivePeriod(
  text: string,
  dueDate: string,
): { period: string; periodLabel: string } {
  const tramo = text.match(
    /Periodo liquidado (1er|2do) tramo del bim\.?\s*(\d{1,2})\/(\d{4})/i,
  );
  if (tramo) {
    const half = tramo[1].toLowerCase() === "1er" ? 1 : 2;
    const month = (Number(tramo[2]) - 1) * 2 + half;
    return {
      period: `${tramo[3]}-${String(month).padStart(2, "0")}-01`,
      periodLabel: `${tramo[1]} tramo del bim. ${tramo[2]}/${tramo[3]}`,
    };
  }

  const simple = matchOrThrow(
    text,
    /Periodo liquidado (\d{1,2})\b/i,
    "period",
  );
  const periodMonth = Number(simple[1]);
  const dueYear = Number(dueDate.slice(0, 4));
  const dueMonth = Number(dueDate.slice(5, 7));
  // A December bill is due in January of the next year
  const periodYear = periodMonth > dueMonth ? dueYear - 1 : dueYear;
  return {
    period: `${periodYear}-${String(periodMonth).padStart(2, "0")}-01`,
    periodLabel: `Periodo liquidado ${periodMonth}`,
  };
}

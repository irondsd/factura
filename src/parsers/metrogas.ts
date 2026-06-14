import {
  matchOrThrow,
  monthOf,
  parseAmountAR,
  parseDateDMY,
} from "./helpers";
import type { VendorParser } from "./types";

/**
 * MetroGAS gas. AR number format (6.778,10). No payment barcode (auto-debit),
 * so label-anchored only. Bimonthly meter cycle billed as two monthly
 * "liquidaciones"; period = month in which the liquidated range starts.
 */
export const metrogasParser: VendorParser = {
  key: "metrogas",
  vendorSlug: "metrogas",
  version: 1,

  detect(text) {
    return /MetroGAS/i.test(text);
  },

  parse(text) {
    const accountNumber = matchOrThrow(
      text,
      /N[úu]mero de cliente\s+(\d{8,12})/i,
      "client number",
    )[1];

    const totalAmount = parseAmountAR(
      matchOrThrow(text, /TOTAL A PAGAR\s+\$\s*([\d.,]+)/, "total")[1],
    );

    const dueDate = parseDateDMY(
      matchOrThrow(
        text,
        /FECHA DE VENCIMIENTO:\s*(\d{2}\/\d{2}\/\d{4})/i,
        "due date",
      )[1],
    );

    const range = matchOrThrow(
      text,
      /PERIODO DE LIQUIDACI[ÓO]N:\s*(\d{2}\/\d{2}\/\d{4}) A (\d{2}\/\d{2}\/\d{4})/i,
      "liquidation period",
    );
    const period = monthOf(parseDateDMY(range[1]));

    const labelMatch = text.match(
      /(PERIODO \d{2}\/\d{4} - LIQUIDACI[ÓO]N \d DE \d DEL BIMESTRE)/i,
    );

    const consumption = text.match(
      /CONSUMO A FACTURAR[^:]*:\s*([\d.,]+)/i,
    );

    return {
      accountNumber,
      period,
      periodLabel: labelMatch?.[1] ?? `${range[1]} a ${range[2]}`,
      totalAmount,
      dueDate,
      consumption: consumption
        ? { value: parseAmountAR(consumption[1]), unit: "m3" }
        : undefined,
    };
  },
};

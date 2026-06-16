import type { ParserConfig } from "../types";

/** MetroGAS gas. AR amounts, label-anchored (no barcode). Period = the month in
 * which the liquidated range starts. */
export const metrogasConfig: ParserConfig = {
  slug: "metrogas",
  vendor: { slug: "metrogas", displayName: "MetroGAS", category: "gas" },
  version: 1,
  detect: { allOf: [{ pattern: "MetroGAS", flags: "i" }] },

  captures: [
    {
      pattern: "N[úu]mero de cliente\\s+(\\d{8,12})",
      flags: "i",
      outputs: { account: { group: 1 } },
    },
    {
      pattern: "TOTAL A PAGAR\\s+\\$\\s*([\\d.,]+)",
      outputs: { amount: { group: 1, transform: ["numberAR"] } },
    },
    {
      pattern: "FECHA DE VENCIMIENTO:\\s*(\\d{2}\\/\\d{2}\\/\\d{4})",
      flags: "i",
      outputs: { due: { group: 1, transform: [{ parseDate: "DMY" }] } },
    },
    {
      pattern:
        "PERIODO DE LIQUIDACI[ÓO]N:\\s*(\\d{2}\\/\\d{2}\\/\\d{4}) A (\\d{2}\\/\\d{2}\\/\\d{4})",
      flags: "i",
      outputs: { period: { group: 1, transform: [{ parseDate: "DMY" }, "monthOf"] } },
    },
    {
      pattern: "CONSUMO A FACTURAR[^:]*:\\s*([\\d.,]+)",
      flags: "i",
      outputs: { consumo: { group: 1, transform: ["numberAR"] } },
    },
  ],

  roles: {
    identity: { sources: ["account"] },
    amount: { sources: ["amount"] },
    period: { sources: ["period"] },
    dueDate: { sources: ["due"] },
  },

  custom: [{ name: "consumption", source: "consumo", type: "quantity", unit: "m3" }],
};

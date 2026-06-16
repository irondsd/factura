import type { ParserConfig } from "../types";

/** Telecom internet. The payment stub total is masked, so the saldo sentence is
 * the anchor; the long digit line is a containment cross-check (it embeds the
 * referente, the amount in cents, and the due date as YYMMDD). */
export const telecomConfig: ParserConfig = {
  slug: "telecom",
  vendor: { slug: "telecom", displayName: "Telecom", category: "internet" },
  version: 1,
  detect: { allOf: [{ pattern: "TELECOM ARGENTINA S\\.A\\.", flags: "i" }] },

  captures: [
    {
      pattern: "Referente de Pago:?\\s*(\\d{16})",
      flags: "i",
      outputs: { account: { group: 1 } },
    },
    {
      pattern:
        "Tu saldo total es de\\s*\\$\\s*(?<amount>[\\d.,]+)\\s*y vence el d[ií]a\\s*(?<due>\\d{2}\\/\\d{2}\\/\\d{4})",
      flags: "i",
      outputs: {
        amount: { group: "amount", transform: ["numberAR"] },
        due: { group: "due", transform: [{ parseDate: "DMY" }] },
      },
    },
  ],

  compute: [
    { name: "period", addMonths: { date: "due", delta: 0 } },
    { name: "centsRaw", expr: "amount * 100" },
    { name: "cents", round: "centsRaw" },
    { name: "dueYYMMDD", formatDate: { date: "due", format: "YYMMDD" } },
  ],

  validations: [
    {
      type: "lineContainsAll",
      linePattern: "\\b\\d{50,}\\b",
      values: ["account", "cents", "dueYYMMDD"],
      label: "Payment line",
    },
  ],

  roles: {
    identity: { sources: ["account"] },
    amount: { sources: ["amount"] },
    period: { sources: ["period"] },
    dueDate: { sources: ["due"] },
  },
};

import type { ParserConfig } from "../types";

/**
 * Expensas — Dominijanni aviso. The PDF embeds the full previous-month receipt,
 * so a `region` slice drops everything from "RECIBO DE PAGO MES ANTERIOR" on
 * before any capture runs. Composite `consorcioCUIT:unit` identity; billed in
 * arrears so período = due month − 1. Cuota Extra only counts when > 0.
 */
export const dominijanniExpensasConfig: ParserConfig = {
  slug: "dominijanni-expensas",
  vendor: {
    slug: "dominijanni-expensas",
    displayName: "Expensas Dominijanni",
  },
  version: 1,
  region: { before: "RECIBO DE PAGO MES ANTERIOR", flags: "i" },
  detect: {
    allOf: [
      { pattern: "DOMINIJANNI", flags: "i" },
      { pattern: "EXPENSAS", flags: "i" },
    ],
  },

  captures: [
    {
      pattern: "C\\.U\\.I\\.T\\.?\\s*([\\d-]{12,13})",
      outputs: { cuit: { group: 1 } },
    },
    {
      pattern: "Unidad:\\s*(\\d+)",
      flags: "i",
      outputs: { unit: { group: 1 } },
    },
    {
      pattern: "A pagar:\\s*\\$\\s*([\\d.,]+)",
      flags: "i",
      outputs: { amount: { group: 1, transform: ["numberAR"] } },
    },
    {
      pattern: "Vence:\\s*(\\d{2}\\/\\d{2}\\/\\d{4})",
      flags: "i",
      outputs: { due: { group: 1, transform: [{ parseDate: "DMY" }] } },
    },
    {
      // Gap bounded (not [^$]*) so the regex stays linear-time; see redos.ts.
      pattern: "Cuota\\s+Extra[^$]{0,60}\\$\\s*([\\d.,]+)",
      flags: "i",
      outputs: { cuotaExtra: { group: 1, transform: ["numberAR"] } },
    },
  ],

  compute: [
    { name: "identity", template: "{cuit}:{unit}" },
    { name: "period", addMonths: { date: "due", delta: -1 } },
    { name: "centsRaw", expr: "amount * 100" },
    { name: "cents", round: "centsRaw" },
    { name: "dueYYMMDD", formatDate: { date: "due", format: "YYMMDD" } },
  ],

  validations: [
    {
      type: "lineContainsAll",
      linePattern: "\\b\\d{40,}\\b",
      values: ["cents", "dueYYMMDD"],
      label: "Payment line",
    },
  ],

  roles: {
    identity: { sources: ["identity"] },
    amount: { sources: ["amount"] },
    period: { sources: ["period"] },
    dueDate: { sources: ["due"] },
  },

  custom: [
    {
      name: "extraordinary",
      source: "cuotaExtra",
      type: "money",
      includeWhen: "cuotaExtra > 0",
    },
  ],
};

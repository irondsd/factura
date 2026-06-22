import type { ParserConfig } from "../types";

/**
 * Edesur electricity, re-expressed as data. Demonstrates the engine's harder
 * features: an optional payment barcode (multiple named groups in one capture),
 * cross-checks between barcode and label (agree/equals → review on mismatch),
 * coalescing barcode-preferred values, and two period dialects resolved by
 * computing both and coalescing the one that matched.
 */
export const edesurConfig: ParserConfig = {
  slug: "edesur",
  vendor: { slug: "edesur", displayName: "Edesur", category: "electricity" },
  version: 1,
  detect: { allOf: [{ pattern: "edesur", flags: "i" }] },

  captures: [
    {
      pattern: "Cliente:?\\s*(\\d{6,10})",
      outputs: { labelAccount: { group: 1, transform: ["stripLeadingZeros"] } },
    },
    {
      pattern:
        "1° ?\\s*Vencimiento:\\s*(\\d{2}\\/\\d{2}\\/\\d{4})\\s*TOTAL:\\s*\\$\\s*([\\d,.]+)",
      flags: "i",
      outputs: {
        labelDue: { group: 1, transform: [{ parseDate: "DMY" }] },
        labelTotal: { group: 2, transform: ["numberUS"] },
      },
    },
    {
      // 009 | client(10) | cents(11) | due YYMMDD(6) | surcharge(9) | 2nd(4) | tail(15)
      pattern:
        "\\b009(?<acct>\\d{10})(?<cents>\\d{11})(?<due>\\d{6})(?<surcharge>\\d{9})\\d{4}\\d{15}\\b",
      outputs: {
        "barcode.acct": { group: "acct", transform: ["stripLeadingZeros"] },
        "barcode.cents": { group: "cents", transform: ["centsToAmount"] },
        "barcode.due": { group: "due", transform: [{ parseDate: "YYMMDD" }] },
        "barcode.surcharge": {
          group: "surcharge",
          transform: ["centsToAmount"],
        },
      },
    },
    {
      // Bimonthly dialect: "1er/2do tramo del bim. 03/2025"
      pattern:
        "Periodo liquidado (?<half>1er|2do) tramo del bim\\.?\\s*(?<bim>\\d{1,2})\\/(?<year>\\d{4})",
      flags: "i",
      outputs: {
        tramoHalf: {
          group: "half",
          transform: [{ lookup: { "1er": 1, "2do": 2 } }],
        },
        tramoBim: { group: "bim", transform: ["toInt"] },
        tramoYear: { group: "year", transform: ["toInt"] },
      },
    },
    {
      // Monthly dialect: "Periodo liquidado 5"
      pattern: "Periodo liquidado (\\d{1,2})\\b",
      flags: "i",
      outputs: { simpleMonth: { group: 1, transform: ["toInt"] } },
    },
    {
      pattern: "Energ[ií]a Consumida\\s+([\\d,.]+)\\s*kWh",
      flags: "i",
      outputs: { kwh: { group: 1, transform: ["numberUS"] } },
    },
  ],

  compute: [
    { name: "due", coalesce: ["barcode.due", "labelDue"] },
    { name: "dueYear", datePart: { date: "due", part: "year" } },
    { name: "dueMonth", datePart: { date: "due", part: "month" } },
    // Bimonthly: month = (bim - 1) * 2 + half
    { name: "tramoMonth", expr: "(tramoBim - 1) * 2 + tramoHalf" },
    {
      name: "tramoPeriod",
      dateFromParts: { year: "tramoYear", month: "tramoMonth", day: 1 },
    },
    // Monthly: a December bill is due in January of the next year
    {
      name: "simpleYear",
      expr: "simpleMonth > dueMonth ? dueYear - 1 : dueYear",
    },
    {
      name: "simplePeriod",
      dateFromParts: { year: "simpleYear", month: "simpleMonth", day: 1 },
    },
    { name: "period", coalesce: ["tramoPeriod", "simplePeriod"] },
  ],

  validations: [
    { type: "agree", a: "labelTotal", b: "barcode.cents", label: "Total" },
    { type: "equals", a: "labelAccount", b: "barcode.acct", label: "Account" },
    { type: "equals", a: "labelDue", b: "barcode.due", label: "Due date" },
  ],

  roles: {
    identity: { sources: ["barcode.acct", "labelAccount"] },
    amount: { sources: ["barcode.cents", "labelTotal"] },
    period: { sources: ["period"] },
    dueDate: { sources: ["due"] },
  },

  custom: [
    { name: "consumption", source: "kwh", type: "quantity", unit: "kWh" },
    { name: "lateSurcharge", source: "barcode.surcharge", type: "money" },
  ],
};

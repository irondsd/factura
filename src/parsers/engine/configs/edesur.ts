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
  vendor: { slug: "edesur", displayName: "Edesur" },
  version: 3,
  // Detection can't lean on the brand name. Edesur's 2026 redesign moved the
  // masthead and the whole legal back-page into vector art, so "Edesur" — which
  // used to appear a dozen times in the extracted text — now appears zero times;
  // the bill drops from ~15k extractable characters to ~3k. Every such bill was
  // landing in review as "unrecognized" even though the captures below still
  // read it perfectly.
  //
  // What survives the redesign is the AFIP footer. `30-65511651-2` is Edesur
  // S.A.'s CUIT, printed as live text on every bill in the new layout; the old
  // layout spells the brand instead. One of the two is always there, and neither
  // can turn up on another distributor's bill — so that pair is the identity
  // anchor, and detection fails closed without it.
  //
  // Everything else on this bill is *regulated*, not Edesur's. Every ENRE
  // distributor issues a "Liquidación de Servicios Públicos", prints a "Código
  // CESP" and bills a "Tarifa T1 R" — Edenor's bills carry all three. They stay
  // on as corroboration (they lift the score, so Edesur beats a vaguer config on
  // a bill they both accept) but none of them may identify the vendor alone.
  //
  // Every accented character below is written `x\s*[áa]\s*y`, because one of the
  // PDF generators Edesur has used emits each non-ASCII glyph as its own text
  // run: the extractor reads "Liquidaci ó n", "Energ í a", "1 ° Vencimiento".
  // Roughly nine in ten bills in the corpus extract that way, so patterns that
  // assume the accent sits flush against its neighbours match almost nothing.
  detect: {
    allOf: [{ pattern: "edesur|CUIT:?\\s*30-65511651-2", flags: "i" }],
    anyOf: [
      {
        pattern: "Liquidaci\\s*[óo]\\s*n de Servicios P\\s*[úu]\\s*blicos",
        flags: "i",
      },
      { pattern: "C\\s*[óo]\\s*digo CESP", flags: "i" },
      // Was "SE:\s*\w+\s+Alimentador:", which never fired: substation names run
      // to several words ("SE: CARLOS PELLEGRINI"). Match the feeder code that
      // follows instead — no bridging quantifier, so the ReDoS gate is happy.
      { pattern: "Alimentador:\\s*\\d+-\\d+-\\d+", flags: "i" },
      { pattern: "Tarifa T1\\s*[RG]", flags: "i" },
      // The payment barcode below, as a bare signature: 009 (the biller code
      // Edesur's codeline carries) plus its 55 payload digits.
      { pattern: "\\b009\\d{55}\\b", weight: 2 },
    ],
  },

  captures: [
    {
      pattern: "Cliente:?\\s*(\\d{6,10})",
      outputs: { labelAccount: { group: 1, transform: ["stripLeadingZeros"] } },
    },
    {
      pattern:
        "\\b1\\s*°\\s*Vencimiento:\\s*(\\d{2}\\/\\d{2}\\/\\d{4})\\s*TOTAL:\\s*\\$\\s*([\\d,.]+)",
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
        "Per\\s*[ií]\\s*odo liquidado (?<half>1er|2do) tramo del bim\\.?\\s*(?<bim>\\d{1,2})\\/(?<year>\\d{4})",
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
      pattern: "Per\\s*[ií]\\s*odo liquidado (\\d{1,2})\\b",
      flags: "i",
      outputs: { simpleMonth: { group: 1, transform: ["toInt"] } },
    },
    {
      pattern: "Energ\\s*[ií]\\s*a Consumida\\s+([\\d,.]+)\\s*kWh",
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

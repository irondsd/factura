import type { ParserConfig } from "../types";

/** 3-letter Spanish month key -> MM, for the "Vencimiento: Jun. 2026" label. */
const SPANISH_MONTHS: Record<string, string> = {
  ene: "01", feb: "02", mar: "03", abr: "04", may: "05", jun: "06",
  jul: "07", ago: "08", sep: "09", set: "09", oct: "10", nov: "11", dic: "12",
};

/**
 * Expensas — consorcio cupón/recibo layout. No client number is printed, so the
 * stable identity is a composite `consorcioCUIT:unit` (template op). The unit is
 * captured with an anchored pattern first (to skip the administrator's own
 * office address) and an unanchored fallback, coalesced. Period prefers the
 * Spanish-month label, falling back to the due month.
 */
export const mdaExpensasConfig: ParserConfig = {
  slug: "mda-expensas",
  vendor: { slug: "mda-expensas", displayName: "Expensas MDA", category: "expensas" },
  version: 1,
  detect: {
    allOf: [
      { pattern: "(Cup[óo]n de pago|Recibo de Pago)", flags: "i" },
      { pattern: "CONSORCIO DE PROPIETARIOS", flags: "i" },
      { pattern: "Expensas", flags: "i" },
    ],
  },

  captures: [
    {
      pattern: "CONSORCIO DE PROPIETARIOS.*?CUIT:\\s*([\\d-]{12,13})",
      flags: "i",
      outputs: { cuit: { group: 1 } },
    },
    {
      // Anchored to the UF code ("009 04-A") or "Consorcista" header.
      pattern:
        "(?:\\b\\d{3}\\s+|Consorcista\\s+)(?<num>\\d{1,3})\\s*(?:[°º]\\s*|-)(?<letter>[A-Z])\\b",
      outputs: {
        unitNumA: { group: "num", transform: ["toInt"] },
        unitLetterA: { group: "letter" },
      },
    },
    {
      // Unanchored fallback.
      pattern: "\\b(?<num>\\d{1,3})\\s*(?:[°º]\\s*|-)(?<letter>[A-Z])\\b",
      outputs: {
        unitNumB: { group: "num", transform: ["toInt"] },
        unitLetterB: { group: "letter" },
      },
    },
    {
      pattern: "1er Vencimiento\\s+(\\d{2}\\/\\d{2}\\/\\d{4})\\s+\\$\\s*([\\d.,]+)",
      flags: "i",
      outputs: {
        due: { group: 1, transform: [{ parseDate: "DMY" }] },
        amount: { group: 2, transform: ["numberAR"] },
      },
    },
    {
      pattern: "Expensas Extraordinarias[^$]*\\$\\s*([\\d.,]+)",
      flags: "i",
      outputs: { extraordinary: { group: 1, transform: ["numberAR"] } },
    },
    {
      pattern: "Vencimiento:\\s*(?<mon>[A-Za-z]{3,12})\\.?\\s*(?<year>\\d{4})",
      outputs: {
        monMM: { group: "mon", transform: ["lowercase", { slice: 3 }, { lookup: SPANISH_MONTHS }] },
        monYear: { group: "year", transform: ["toInt"] },
      },
    },
  ],

  compute: [
    { name: "unitNum", coalesce: ["unitNumA", "unitNumB"] },
    { name: "unitLetter", coalesce: ["unitLetterA", "unitLetterB"] },
    { name: "identity", template: "{cuit}:{unitNum}{unitLetter}" },
    { name: "periodFromLabel", dateFromParts: { year: "monYear", month: "monMM", day: 1 } },
    { name: "periodFromDue", addMonths: { date: "due", delta: 0 } },
    { name: "period", coalesce: ["periodFromLabel", "periodFromDue"] },
  ],

  roles: {
    identity: { sources: ["identity"] },
    amount: { sources: ["amount"] },
    period: { sources: ["period"] },
    dueDate: { sources: ["due"] },
  },

  custom: [{ name: "extraordinary", source: "extraordinary", type: "money" }],
};

import { ParseError } from "./engine/types";

/** "362.675,09" / "$ 1.646,24" / "473,74-" -> number */
export function parseAmountAR(s: string): number {
  const negative = /-\s*$/.test(s);
  const cleaned = s.replace(/[^\d,]/g, "").replace(",", ".");
  const value = Number(cleaned);
  if (Number.isNaN(value)) throw new ParseError(`Bad AR amount: "${s}"`);
  return negative ? -value : value;
}

/** "22,590.52" / "$ 1,646.24" / "473.74-" -> number */
export function parseAmountUS(s: string): number {
  const negative = /-\s*$/.test(s);
  const cleaned = s.replace(/[^\d.]/g, "");
  const value = Number(cleaned);
  if (Number.isNaN(value)) throw new ParseError(`Bad US amount: "${s}"`);
  return negative ? -value : value;
}

/** "18/05/2026" -> "2026-05-18" */
export function parseDateDMY(s: string): string {
  const m = s.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) throw new ParseError(`Bad date: "${s}"`);
  return `${m[3]}-${m[2]}-${m[1]}`;
}

/** "260601" (YYMMDD) -> "2026-06-01" */
export function parseDateYYMMDD(s: string): string {
  const m = s.match(/^(\d{2})(\d{2})(\d{2})$/);
  if (!m) throw new ParseError(`Bad YYMMDD date: "${s}"`);
  return `20${m[1]}-${m[2]}-${m[3]}`;
}

/** "2026-05-18" -> "2026-05-01" */
export function monthOf(isoDate: string): string {
  return `${isoDate.slice(0, 7)}-01`;
}

/** "2026-06-01", -1 -> "2026-05-01" */
export function addMonths(isoMonth: string, delta: number): string {
  const [y, m] = isoMonth.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.toISOString().slice(0, 7)}-01`;
}

export function matchOrThrow(
  text: string,
  re: RegExp,
  what: string,
): RegExpMatchArray {
  const m = text.match(re);
  if (!m) throw new ParseError(`Could not find ${what}`);
  return m;
}

/** Amounts must agree to the cent between barcode payload and labeled text. */
export function assertAmountsAgree(
  a: number,
  b: number,
  context: string,
): void {
  if (Math.round(a * 100) !== Math.round(b * 100)) {
    throw new ParseError(
      `${context}: barcode says ${a} but label says ${b} — needs review`,
    );
  }
}

const ES_MONTHS: Record<string, string> = {
  ene: "01",
  feb: "02",
  mar: "03",
  abr: "04",
  may: "05",
  jun: "06",
  jul: "07",
  ago: "08",
  sep: "09",
  set: "09",
  oct: "10",
  nov: "11",
  dic: "12",
};

/** "Jun. 2026" / "Junio 2026" -> "2026-06-01" */
export function parseSpanishMonth(name: string, year: string): string {
  const key = name.slice(0, 3).toLowerCase();
  const mm = ES_MONTHS[key];
  if (!mm) throw new ParseError(`Unknown Spanish month: "${name}"`);
  return `${year}-${mm}-01`;
}

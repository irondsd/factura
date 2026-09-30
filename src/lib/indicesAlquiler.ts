// The arithmetic behind <CalculadoraAlquiler />: how a rent written into a
// contract moves when it is updated by the ICL or by the IPC.
//
// Pure functions over data passed in, so the tests can feed small fixtures and
// the refresh script can validate a file before writing it. The real series
// live in `src/content/guias/data/indices-alquiler.json`, loaded and checked by
// `src/content/guias/data/indices-alquiler.ts`.
//
// ── The two indices ────────────────────────────────────────────────────────
// ICL (Índice para Contratos de Locación): published by the BCRA **for every
// calendar day**, base 30-06-2020 = 1, with two decimals — the two decimals
// are the official index, not a rounding of ours. Contracts under the Ley
// 27.551 (1-7-2020 to 16-10-2023) had to use it, once a year; later contracts
// may still choose it. A rent updated by the ICL is multiplied by the index on
// the day the new rent starts over the index on the day the previous one
// started. The BCRA publishes each day's value weeks ahead, which is why the
// data runs past today.
//
// IPC: INDEC's national nivel general, one index level per month, base
// December 2016 = 100. Contracts since the DNU 70/2023 mostly use it, every
// three, four or six months. There is no single convention for *which* months
// an update covers, and the contract decides:
//   • "del período": an update that starts in April covers January–March;
//   • "con desfase": it covers December–February, because March is published
//     only in mid-April, after the rent is due.
// The calculator offers both and says which it used. Either way the factor is
// the ratio of two index levels (cumulative variation over the months), not a
// product of the rounded monthly percentages, which drifts by a few tenths.
//
// An update whose index is not published yet is *pending*, never estimated:
// a projected inflation figure next to real ones reads like a real one.

export type Indice = "icl" | "ipc";

/** Daily series: one value per calendar day, from `start` on. */
export type SerieDiaria = { start: string; values: readonly number[] };
/** Monthly series: one value per month (`YYYY-MM`), from `start` on. */
export type SerieMensual = { start: string; values: readonly number[] };

export type Indices = { icl: SerieDiaria; ipc: SerieMensual };

// ── Dates ──────────────────────────────────────────────────────────────────
// Everything is plain calendar arithmetic in UTC on `YYYY-MM-DD` strings: a
// rent that changes "el 1 de junio" must not become 31 de mayo for a reader
// west of Greenwich.

const DAY_MS = 86_400_000;

const isIsoDate = (value: string): boolean =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) &&
  new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

const dayNumber = (iso: string): number =>
  Date.parse(`${iso}T00:00:00Z`) / DAY_MS;

const fromDayNumber = (day: number): string =>
  new Date(day * DAY_MS).toISOString().slice(0, 10);

const monthNumber = (month: string): number =>
  Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7)) - 1;

const fromMonthNumber = (n: number): string =>
  `${Math.floor(n / 12)}-${String((n % 12) + 1).padStart(2, "0")}`;

/** `start` moved `months` months ahead, keeping its day of the month and
 * clamping to the month's last day: 31-1 + 1 month is 28-2 (or 29-2). The day
 * always comes from the contract's start, so a 31 that fell on a 30 in April
 * is a 31 again in May. */
export function addMonths(start: string, months: number): string {
  const [y, m, d] = start.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(
    Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0),
  ).getUTCDate();
  first.setUTCDate(Math.min(d, last));
  return first.toISOString().slice(0, 10);
}

export const monthOf = (iso: string): string => iso.slice(0, 7);
export const shiftMonthBy = (month: string, delta: number): string =>
  fromMonthNumber(monthNumber(month) + delta);

// ── Series ─────────────────────────────────────────────────────────────────

export const lastDay = (serie: SerieDiaria): string =>
  fromDayNumber(dayNumber(serie.start) + serie.values.length - 1);

export const lastMonth = (serie: SerieMensual): string =>
  fromMonthNumber(monthNumber(serie.start) + serie.values.length - 1);

/** The ICL on one day, or null when that day is outside the series. */
export function iclAt(serie: SerieDiaria, iso: string): number | null {
  const i = dayNumber(iso) - dayNumber(serie.start);
  return i >= 0 && i < serie.values.length ? serie.values[i] : null;
}

/** The IPC level of one month, or null when that month is not in the series
 * (before it starts, or not published yet). */
export function ipcAt(serie: SerieMensual, month: string): number | null {
  const i = monthNumber(month) - monthNumber(serie.start);
  return i >= 0 && i < serie.values.length ? serie.values[i] : null;
}

/** Throws with a readable message unless `indices` is well formed. The data
 * module calls this at import, so a malformed refresh fails the build instead
 * of drawing a wrong table. */
export function assertIndices(indices: Indices, context: string): void {
  const { icl, ipc } = indices;
  if (!isIsoDate(icl.start)) {
    throw new Error(`${context}: icl.start ${JSON.stringify(icl.start)}`);
  }
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(ipc.start)) {
    throw new Error(`${context}: ipc.start ${JSON.stringify(ipc.start)}`);
  }
  for (const [name, values] of [
    ["icl", icl.values],
    ["ipc", ipc.values],
  ] as const) {
    if (!Array.isArray(values) || values.length === 0) {
      throw new Error(`${context}: ${name} has no values`);
    }
    values.forEach((value, i) => {
      if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
        throw new Error(`${context}: ${name}[${i}] = ${JSON.stringify(value)}`);
      }
    });
  }
  // The ICL is published with exactly two decimals; more means the file was
  // filled from somewhere other than the BCRA.
  icl.values.forEach((value, i) => {
    if (Math.abs(value * 100 - Math.round(value * 100)) > 1e-6) {
      throw new Error(
        `${context}: icl ${fromDayNumber(dayNumber(icl.start) + i)} = ${value} has more than two decimals`,
      );
    }
  });
}

// ── The calculation ────────────────────────────────────────────────────────

export type Entrada = {
  /** Rent at the start of the contract, in pesos. */
  monto: number;
  /** First day of the contract, `YYYY-MM-DD`. */
  inicio: string;
  indice: Indice;
  /** Months between updates. */
  cadaMeses: number;
  /** Length of the contract in months. */
  duracionMeses: number;
  /** IPC only: 0 = the months of the period, 1 = one month earlier. */
  desfaseIpc: 0 | 1;
};

export type Detalle =
  | {
      indice: "icl";
      desde: { fecha: string; valor: number | null };
      hasta: { fecha: string; valor: number | null };
    }
  | { indice: "ipc"; desdeMes: string; hastaMes: string };

export type Tramo = {
  /** Day the rent in this row starts to apply. */
  desde: string;
  /** Rent from `desde` on; null while the update is pending. */
  monto: number | null;
  /** Multiplier over the previous row; null for the first row and pending. */
  factor: number | null;
  /** Multiplier over the starting rent; null while pending. */
  acumulado: number | null;
  /** Which index values produced the factor. Present even when pending, so the
   * row can say what it is waiting for. */
  detalle: Detalle | null;
  /** Why the row has no amount yet: the day or month the index still lacks. */
  pendiente: { indice: "icl"; fecha: string } | { indice: "ipc"; mes: string } | null;
};

/** Why a contract can't be calculated. The component words these; `minimo`
 * is the first start date the chosen index can price. */
export type ErrorEntrada =
  | { error: "monto" }
  | { error: "inicio" }
  | { error: "frecuencia" }
  | { error: "antes-de-la-serie"; minimo: string };

export type Resultado =
  | { ok: true; tramos: Tramo[] }
  | ({ ok: false } & ErrorEntrada);

/** The first contract start the chosen index can price. */
export function primerInicio(indices: Indices, indice: Indice, desfase: 0 | 1): string {
  if (indice === "icl") return indices.icl.start;
  // The first update needs the level of the month before the first covered
  // month: start month − 1 − desfase.
  return `${shiftMonthBy(indices.ipc.start, 1 + desfase)}-01`;
}

/** Every rent of the contract, one row per update. */
export function calcularTramos(entrada: Entrada, indices: Indices): Resultado {
  const { monto, inicio, indice, cadaMeses, duracionMeses, desfaseIpc } =
    entrada;
  if (!Number.isFinite(monto) || monto <= 0) return { ok: false, error: "monto" };
  if (!isIsoDate(inicio)) return { ok: false, error: "inicio" };
  if (!Number.isInteger(cadaMeses) || cadaMeses < 1) {
    return { ok: false, error: "frecuencia" };
  }
  const minimo = primerInicio(indices, indice, desfaseIpc);
  if (inicio < minimo) {
    return { ok: false, error: "antes-de-la-serie", minimo };
  }

  const tramos: Tramo[] = [
    {
      desde: inicio,
      monto,
      factor: null,
      acumulado: 1,
      detalle: null,
      pendiente: null,
    },
  ];
  let acumulado: number | null = 1;
  const fin = addMonths(inicio, duracionMeses);

  for (let k = 1; ; k++) {
    const desde = addMonths(inicio, k * cadaMeses);
    if (desde >= fin) break;
    const anterior = tramos[k - 1].desde;

    let factor: number | null = null;
    let detalle: Detalle;
    let pendiente: Tramo["pendiente"] = null;

    if (indice === "icl") {
      const base = iclAt(indices.icl, anterior);
      const actual = iclAt(indices.icl, desde);
      detalle = {
        indice: "icl",
        desde: { fecha: anterior, valor: base },
        hasta: { fecha: desde, valor: actual },
      };
      if (base === null) pendiente = { indice: "icl", fecha: anterior };
      else if (actual === null) pendiente = { indice: "icl", fecha: desde };
      else factor = actual / base;
    } else {
      // Months covered: from the previous row's month to the month before
      // this one, both moved back by the desfase. The factor is the level at
      // the end of the last covered month over the level at the end of the
      // month before the first one.
      const desdeMes = shiftMonthBy(monthOf(anterior), -desfaseIpc);
      const hastaMes = shiftMonthBy(monthOf(desde), -1 - desfaseIpc);
      detalle = { indice: "ipc", desdeMes, hastaMes };
      const base = ipcAt(indices.ipc, shiftMonthBy(desdeMes, -1));
      const actual = ipcAt(indices.ipc, hastaMes);
      if (base === null) pendiente = { indice: "ipc", mes: shiftMonthBy(desdeMes, -1) };
      else if (actual === null) pendiente = { indice: "ipc", mes: hastaMes };
      else factor = actual / base;
    }

    acumulado = acumulado !== null && factor !== null ? acumulado * factor : null;
    tramos.push({
      desde,
      monto: acumulado !== null ? monto * acumulado : null,
      factor,
      acumulado,
      detalle,
      pendiente,
    });
  }

  return { ok: true, tramos };
}

/** Index of the row in force on `hoy`, or -1 when `hoy` is outside the
 * contract. */
export function tramoVigente(
  tramos: readonly Tramo[],
  hoy: string,
  finContrato: string,
): number {
  if (!tramos.length || hoy < tramos[0].desde || hoy >= finContrato) return -1;
  let vigente = 0;
  tramos.forEach((t, i) => {
    if (t.desde <= hoy) vigente = i;
  });
  return vigente;
}

// Residential value of ABSA's general m³/module from December 2024 onward.
// The nominal tariff is a step series; the GBA general-level IPC is monthly.
// Their common period ends when the last released IPC row does.
//
// A `STEPS` row has been checked against an ABSA or government primary source
// when `official` is true. Press reports remain only where no primary record
// could be checked.
// ABSA's current page can advance ahead of the IPC: append both series only
// when each period is actually published. INDEC's CSV uses `Codigo` 0 and
// `Region` GBA for the general level:
// https://www.aguasbonaerenses.com.ar/usuarios/mi-factura/cuadro-tarifario/
// https://www.indec.gob.ar/ftp/cuadros/economia/serie_ipc_aperturas.csv

/** One value of `VM`, and the day it started applying. */
export type TariffStep = {
  /** `YYYYMM` of the first month billed at this value. */
  period: string;
  /** Pesos per m³/módulo, residential. */
  vm: number;
  /** The norm that set it, as it should be cited on the page. */
  norm: string;
  /** True when checked against a primary ABSA or government source. */
  official: boolean;
  /** Why this step is interesting, where it is. Rendered in the table. */
  note: string | null;
};

/** The values `VM` has taken under the Decreto 3044/2024 regime.
 *
 * December 2024 is the first row because that is when the regime starts: before
 * it, adjustments were discretionary rather than formula-driven, and a series
 * that reached back further would be comparing two different things. */
export const STEPS: readonly TariffStep[] = [
  {
    period: "202412",
    vm: 163.22,
    norm: "RESO-2024-1083-GDEBA-MIYSPGP",
    official: true,
    note: "Primer valor del régimen de actualización por fórmula.",
  },
  {
    period: "202504",
    vm: 163.48,
    norm: "RESO-2025-233-GDEBA-MIYSPGP",
    official: true,
    note: "Un aumento de 26 centavos: 0,2 % contra una inflación de 11,3 % en los mismos cuatro meses.",
  },
  {
    period: "202508",
    vm: 177.5,
    norm: "RESO-2025-669-GDEBA-MIYSPGP",
    official: true,
    note: null,
  },
  {
    period: "202512",
    vm: 196.76,
    norm: "RESO-2025-1069-GDEBA-MIYSPGP",
    official: true,
    note: null,
  },
  {
    period: "202602",
    vm: 275.46,
    norm: "RESO-2026-66-GDEBA-MIYSPGP",
    official: true,
    note: "Aprobado en la audiencia pública del 9 de enero. Se facturó recién en abril, con retroactivo.",
  },
  {
    period: "202606",
    vm: 292.5,
    norm: "RESO-2026-448-GDEBA-MIYSPGP",
    official: true,
    note: "Primera actualización del esquema bimestral.",
  },
  {
    period: "202608",
    vm: 314.71,
    norm: "RESO-2026-600-GDEBA-MIYSPGP",
    official: true,
    note: null,
  },
  {
    period: "202610",
    vm: 335.24,
    norm: "RESO-2026-754-GDEBA-MIYSPGP",
    official: true,
    note: "Vigente desde el 1 de octubre de 2026.",
  },
];

/** INDEC's IPC for GBA, nivel general, monthly index levels on the published
 * base (diciembre 2016 = 100).
 *
 * The *general* level, deliberately, not division 04 — the one that contains
 * water. Deflating a water tariff by an index the tariff is itself an input to
 * would flatten exactly the movement the page is about. What a reader wants to
 * know is whether the water bill outran prices in general, so prices in general
 * are the ruler. */
export const IPC: readonly { period: string; index: number }[] = [
  { period: "202412", index: 7678.775 },
  { period: "202501", index: 7834.148 },
  { period: "202502", index: 8009.227 },
  { period: "202503", index: 8317.925 },
  { period: "202504", index: 8547.313 },
  { period: "202505", index: 8675.5948 },
  { period: "202506", index: 8851.2214 },
  { period: "202507", index: 9016.5562 },
  { period: "202508", index: 9185.3068 },
  { period: "202509", index: 9377.7681 },
  { period: "202510", index: 9602.5137 },
  { period: "202511", index: 9840.8457 },
  { period: "202512", index: 10115.6707 },
  { period: "202601", index: 10395.7458 },
  { period: "202602", index: 10667.6896 },
  { period: "202603", index: 11031.5404 },
  { period: "202604", index: 11336.5576 },
  { period: "202605", index: 11594.5499 },
  { period: "202606", index: 11810.9464 },
  { period: "202607", index: 12078.7372 },
  { period: "202608", index: 12276.812 },
  { period: "202609", index: 12523.1733 },
];

/** The multiplier applied to `VM` for a non-residential user, and the norm that
 * set it. Two rows, and the second is the page's least-reported fact. */
export const COEFFICIENTS: readonly {
  period: string;
  coef: number;
  norm: string;
}[] = [
  { period: "202412", coef: 1.3, norm: "Decreto 3044/2024" },
  { period: "202602", coef: 1.6, norm: "Decreto 127/2026" },
];

/** What ABSA told the audiencia pública the increase would do to an average
 * bill, and how many users it reaches.
 *
 * Reported figures, not ours: they come from the company's own presentation on
 * 9 January 2026 and we have no way to recompute them, because the average
 * depends on the mix of metered and unmetered customers and on the VFI bands,
 * neither of which is published. Quoted as ABSA's claim, and labelled as one. */
export const HEARING = {
  date: "2026-01-09",
  averageBillBefore: 13_700,
  averageBillAfter: 18_410,
  residentialUnits: 751_234,
  nonResidentialUnits: 131_256,
} as const;

/** ABSA's own description of what it operates, from its institutional page. */
export const SERVICE_AREA = {
  localities: 95,
  municipalities: 53,
  users: 863_000,
  people: 2_600_000,
} as const;

export const SOURCE = "ABSA y normas oficiales de la Provincia de Buenos Aires";
export const IPC_SOURCE = "INDEC, IPC GBA nivel general";

// ── Derived ───────────────────────────────────────────────────────────────

const periodToNum = (p: string) => Number(p);

/** Every month from the first step to the last, inclusive. */
function monthRange(from: string, to: string): string[] {
  const out: string[] = [];
  let y = Number(from.slice(0, 4));
  let m = Number(from.slice(4, 6));
  const end = periodToNum(to);
  while (y * 100 + m <= end) {
    out.push(`${y}${String(m).padStart(2, "0")}`);
    m += 1;
    if (m === 13) {
      y += 1;
      m = 1;
    }
  }
  return out;
}

/** `VM` in force during `period` — the step function, held between decrees. */
export function vmAt(period: string): number {
  let value = STEPS[0].vm;
  for (const step of STEPS) {
    if (periodToNum(step.period) <= periodToNum(period)) value = step.vm;
  }
  return value;
}

/** The non-residential multiplier in force during `period`. */
export function coefAt(period: string): number {
  let value = COEFFICIENTS[0].coef;
  for (const row of COEFFICIENTS) {
    if (periodToNum(row.period) <= periodToNum(period)) value = row.coef;
  }
  return value;
}

const IPC_BY_PERIOD = new Map(IPC.map((r) => [r.period, r.index]));

export const FIRST_PERIOD = STEPS[0].period;
export const LAST_STEP = STEPS[STEPS.length - 1];
export const PREVIOUS_STEP = STEPS[STEPS.length - 2];

/** The last month both series cover. The nominal tariff runs ahead of it —
 * a decree is published before it applies — so anything computed in real terms
 * stops here, and the page says so rather than letting a line dangle. */
export const REAL_THROUGH = IPC[IPC.length - 1].period;

export type MonthPoint = {
  period: string;
  vm: number;
  /** `VM` indexed to the first month = 100. */
  nominalIndex: number;
  /** IPC indexed to the first month = 100, or null past the published series. */
  ipcIndex: number | null;
  /** Nominal over IPC, as a percentage gap: how far ahead of general prices the
   * tariff is, measured from December 2024. Null where there is no IPC yet. */
  realGap: number | null;
  /** True on a month a new `VM` took effect — the steps in the staircase. */
  isStep: boolean;
};

const BASE_VM = STEPS[0].vm;
const BASE_IPC = IPC[0].index;

const STEP_PERIODS = new Set(STEPS.map((s) => s.period));

/** The monthly series both charts read. */
export const MONTHS: readonly MonthPoint[] = monthRange(
  FIRST_PERIOD,
  LAST_STEP.period,
).map((period) => {
  const vm = vmAt(period);
  const ipc = IPC_BY_PERIOD.get(period) ?? null;
  const nominalIndex = (vm / BASE_VM) * 100;
  const ipcIndex = ipc === null ? null : (ipc / BASE_IPC) * 100;
  return {
    period,
    vm,
    nominalIndex,
    ipcIndex,
    realGap: ipcIndex === null ? null : (nominalIndex / ipcIndex - 1) * 100,
    isStep: STEP_PERIODS.has(period),
  };
});

const withGap = MONTHS.filter(
  (m): m is MonthPoint & { realGap: number } => m.realGap !== null,
);

/** The deepest the tariff fell behind general prices, and when. The floor of
 * the sawtooth — and the reason the February correction was as large as it was. */
export const WORST_LAG = withGap.reduce((a, m) =>
  m.realGap < a.realGap ? m : a,
);

/** The furthest ahead of general prices the tariff has been since the regime
 * started, and when. */
export const PEAK_REAL = withGap.reduce((a, m) =>
  m.realGap > a.realGap ? m : a,
);

/** Where the tariff stands against general prices in the last month both series
 * cover. */
export const CURRENT_REAL = withGap[withGap.length - 1];

/** Percentage change of `VM` between two periods. */
export function changeBetween(from: string, to: string): number {
  return (vmAt(to) / vmAt(from) - 1) * 100;
}

/** The 2026 story in one number: December 2025 to the newest step. */
export const CUMULATIVE_2026 = changeBetween("202512", LAST_STEP.period);

/** General prices over the window `CUMULATIVE_2026` covers — but only as far as
 * the IPC is published, which is why the page words it as "hasta {REAL_THROUGH}". */
export const IPC_2026 =
  ((IPC_BY_PERIOD.get(REAL_THROUGH) as number) /
    (IPC_BY_PERIOD.get("202512") as number) -
    1) *
  100;

/** Residential and non-residential `VM` either side of the February decree,
 * with the rise decomposed into the part everybody reported and the part
 * nobody did.
 *
 * `tariffPart` and `coefPart` multiply to `total` exactly; they are computed
 * rather than written so the identity cannot drift if a figure is corrected. */
export const COMMERCIAL_SHOCK = (() => {
  const before = "202601";
  const after = "202602";
  const vmBefore = vmAt(before);
  const vmAfter = vmAt(after);
  const coefBefore = coefAt(before);
  const coefAfter = coefAt(after);
  return {
    residentialBefore: vmBefore,
    residentialAfter: vmAfter,
    commercialBefore: vmBefore * coefBefore,
    commercialAfter: vmAfter * coefAfter,
    coefBefore,
    coefAfter,
    tariffPart: (vmAfter / vmBefore - 1) * 100,
    coefPart: (coefAfter / coefBefore - 1) * 100,
    total: ((vmAfter * coefAfter) / (vmBefore * coefBefore) - 1) * 100,
  };
})();

// ── Formatting ────────────────────────────────────────────────────────────
// One place, so an axis can never round differently from the prose beside it.

const money = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const moneyWhole = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});

export const formatVm = (v: number) => money.format(v);
export const formatPesos = (v: number) => moneyWhole.format(v);
export const formatCount = (v: number) => v.toLocaleString("es-AR");

export function formatPct(v: number, digits = 1): string {
  const s = Math.abs(v).toLocaleString("es-AR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  return `${v >= 0 ? "+" : "−"}${s} %`;
}

/** Unsigned, for a magnitude the sentence already gives a direction to. */
export function formatMagnitude(v: number, digits = 1): string {
  return `${Math.abs(v).toLocaleString("es-AR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })} %`;
}

const MONTH_NAMES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

/** `"202602"` → `"febrero de 2026"`. */
export function formatPeriod(period: string): string {
  const y = period.slice(0, 4);
  const m = Number(period.slice(4, 6));
  return `${MONTH_NAMES[m - 1]} de ${y}`;
}

/** `"202602"` → `"feb 26"`, for an axis. */
export function formatPeriodShort(period: string): string {
  const y = period.slice(2, 4);
  const m = Number(period.slice(4, 6));
  return `${MONTH_NAMES[m - 1].slice(0, 3)} ${y}`;
}

/** The month the tariff series runs to, for a footnote. */
export const LAST_UPDATED = formatPeriod(LAST_STEP.period);

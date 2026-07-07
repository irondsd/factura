// Static sample data for the public /demo experience — a coherent, fictional
// "Palermo" apartment with four vendors and ~2 years of history. Everything here
// is hand-authored (deterministic, no DB, no auth) and typed against the real
// `RouterOutputs`, so the demo renders the exact same view components as the
// signed-in app and the fixtures can't silently drift from the procedure shapes.
//
// The series is anchored to a fixed EPOCH, not to "today": every value is a pure
// function of its absolute calendar month, so a given month always shows the
// same numbers and past bills never change. `now` (the real current month, read
// at render time) only decides which months are in view and which one is still
// "awaiting" — so the demo rolls forward on its own (June → July → …) while the
// figures stay stable. See `revalidate` on the /demo pages for the cadence.

import { type InsightsWindow, monthRange } from "@/lib/insights";
import { vendorColorVar } from "@/lib/vendorColors";
import type { RouterOutputs } from "@/lib/trpc";

type Overview = RouterOutputs["insights"]["overview"];
type Series = RouterOutputs["insights"]["series"];
type VendorDetail = NonNullable<RouterOutputs["insights"]["vendorDetail"]>;
type VendorRow = RouterOutputs["vendors"]["list"][number];
type PropertyRow = RouterOutputs["properties"]["list"][number];
type Paged = RouterOutputs["bills"]["listPaged"];
type PagedRow = Paged["rows"][number];
type BillGet = NonNullable<RouterOutputs["bills"]["get"]>;

// ── Identities ──────────────────────────────────────────────────────────────
const PROPERTY_ID = "d0000000-0000-4000-8000-000000000001";
const USER_ID = "d0000000-0000-4000-8000-0000000000ff";

type VendorKey = "expensas" | "metrogas" | "personal" | "edesur";

type VendorDef = {
  key: VendorKey;
  id: string;
  accountId: string;
  slug: string;
  displayName: string;
  color: string; // palette *name*
};

const VENDORS: VendorDef[] = [
  {
    key: "expensas",
    id: "d0000000-0000-4000-8000-000000000010",
    accountId: "d0000000-0000-4000-8000-000000000110",
    slug: "expensas",
    displayName: "Expensas",
    color: "dark-earth",
  },
  {
    key: "metrogas",
    id: "d0000000-0000-4000-8000-000000000011",
    accountId: "d0000000-0000-4000-8000-000000000111",
    slug: "metrogas",
    displayName: "MetroGAS",
    color: "burnt-orange",
  },
  {
    key: "personal",
    id: "d0000000-0000-4000-8000-000000000012",
    accountId: "d0000000-0000-4000-8000-000000000112",
    slug: "personal",
    displayName: "Personal",
    color: "taupe",
  },
  {
    key: "edesur",
    id: "d0000000-0000-4000-8000-000000000013",
    accountId: "d0000000-0000-4000-8000-000000000113",
    slug: "edesur",
    displayName: "Edesur",
    color: "sage",
  },
];

const VENDOR_BY_KEY = new Map(VENDORS.map((v) => [v.key, v]));
const vendorMeta = (v: VendorDef) => ({
  id: v.id,
  displayName: v.displayName,
  color: vendorColorVar(v.color),
});

// ── Time + currency model ───────────────────────────────────────────────────
// The deterministic spine. EPOCH is where the series begins; every value scales
// with `idx` = months elapsed since EPOCH, so it's stable per calendar month and
// keeps climbing realistically as the demo rolls into the future.
const EPOCH = "2024-07";

/** Real current month ("YYYY-MM"), evaluated at render time. */
function nowMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

function monthsBetween(from: string, to: string): number {
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  return (ty - fy) * 12 + (tm - fm);
}

/** "YYYY-MM" list ending at `end`, length `n` (oldest → newest). */
function monthList(end: string, n: number): string[] {
  const [ey, em] = end.split("-").map(Number);
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(ey, em - 1 - i, 1));
    out.push(d.toISOString().slice(0, 7));
  }
  return out;
}

const idx = (month: string) => monthsBetween(EPOCH, month); // 0 at EPOCH, grows
const calMonth = (month: string) => Number(month.slice(5)); // 1..12

/** ARS→USD blue rate, climbing with inflation (~900 over the first two years). */
function rate(month: string): number {
  return Math.round(900 + (idx(month) / 23) * 350);
}

/** Peso inflation multiplier (pesos climb; USD stays flatter). */
const inflation = (month: string) => 1 + (idx(month) / 23) * 0.32;

// The current month is still filling in: MetroGAS (gas) hasn't arrived yet.
const AWAITING_KEY: VendorKey = "metrogas";
const hasBill = (key: VendorKey, month: string, now: string) =>
  !(month === now && key === AWAITING_KEY);

/** Native ARS amount for a vendor in a given month. */
function amountARS(key: VendorKey, month: string): number {
  const infl = inflation(month);
  switch (key) {
    case "expensas":
      // Largest, steady line that creeps up every month.
      return Math.round(160000 * infl + idx(month) * 1500);
    case "personal":
      return Math.round(14000 * infl);
    case "edesur": {
      // Mild summer (AC) bump in Dec–Feb.
      const m = calMonth(month);
      const summer = [12, 1, 2].includes(m) ? 1.35 : 1;
      return Math.round(13500 * infl * summer);
    }
    case "metrogas": {
      // Strong winter (heating) peak in Jun–Aug.
      const m = calMonth(month);
      const winter = [6, 7, 8].includes(m)
        ? 1
        : [5, 9].includes(m)
          ? 0.55
          : 0.18;
      return Math.round((12000 + winter * 50000) * infl);
    }
  }
}

/** A parser-extracted quantity (the meter reading) for vendors that have one. */
function quantity(key: VendorKey, month: string): number | null {
  const m = calMonth(month);
  switch (key) {
    case "edesur": // kWh
      return Math.round(190 + ([12, 1, 2].includes(m) ? 130 : 0) + idx(month));
    case "metrogas": // m³
      return Math.round(
        18 + ([6, 7, 8].includes(m) ? 170 : [5, 9].includes(m) ? 80 : 10),
      );
    case "personal": // GB of data
      return Math.round(8 + idx(month) * 0.25);
    default:
      return null;
  }
}

const usdOf = (ars: number, month: string) => ars / rate(month);

// ── Insights aggregation (mirrors server/routers/insights.aggregate) ─────────
type View = Overview["byCurrency"]["ARS"];

function rebase(vals: (number | null)[]): (number | null)[] {
  const first = vals.find((v) => v != null);
  return vals.map((v) => (v == null || !first ? null : (v / first) * 100));
}

function valueIn(key: VendorKey, month: string, currency: "ARS" | "USD") {
  const ars = amountARS(key, month);
  return currency === "USD" ? usdOf(ars, month) : ars;
}

/** A month is complete when every vendor has a bill that period. */
function completeFlagsFor(months: string[], now: string): boolean[] {
  return months.map((m) => VENDORS.every((v) => hasBill(v.key, m, now)));
}

function buildView(
  months: string[],
  currency: "ARS" | "USD",
  now: string,
): View {
  const completeFlags = completeFlagsFor(months, now);

  const series = months.map((m) => {
    const byVendor: Record<string, number> = {};
    let total = 0;
    for (const v of VENDORS) {
      if (!hasBill(v.key, m, now)) continue;
      const val = valueIn(v.key, m, currency);
      byVendor[v.id] = val;
      total += val;
    }
    return { month: m, byVendor, total };
  });

  const shareAcc: Record<string, number> = {};
  series.forEach((s, i) => {
    if (!completeFlags[i]) return;
    for (const [id, amt] of Object.entries(s.byVendor))
      shareAcc[id] = (shareAcc[id] ?? 0) + amt;
  });
  const share = VENDORS.filter((v) => shareAcc[v.id])
    .map((v) => ({ vendorId: v.id, value: shareAcc[v.id] }))
    .sort((a, b) => b.value - a.value);

  const perVendor = VENDORS.map((v) => {
    const values = series.map((s) => s.byVendor[v.id] ?? null);
    const known = values.filter((x): x is number => x != null);
    const first = known[0];
    const lastV = known[known.length - 1];
    const pct = first ? ((lastV - first) / first) * 100 : null;
    return { vendor: vendorMeta(v), values, last: lastV ?? null, pct };
  });

  return { series, share, perVendor };
}

function buildByCurrency(months: string[], now: string) {
  return {
    ARS: buildView(months, "ARS", now),
    USD: buildView(months, "USD", now),
  };
}

// ── Public fixtures: catalog ────────────────────────────────────────────────
const CREATED_AT = "2024-07-01 12:00:00";

export const demoProperty = { id: PROPERTY_ID, nickname: "Palermo" };

/** properties.list shape — a single demo property the visitor "owns". */
export const demoProperties: PropertyRow[] = [
  {
    id: PROPERTY_ID,
    nickname: "Palermo",
    addressVariants: ["Av. Santa Fe 3200, Palermo"],
    role: "owner",
    members: [
      { userId: USER_ID, role: "owner", name: "You", email: "you@example.com" },
    ],
    invites: [],
  },
];

/** vendors.list shape — raw rows (color is the palette *name*). */
export const demoVendors: VendorRow[] = VENDORS.map((v) => ({
  id: v.id,
  propertyId: PROPERTY_ID,
  slug: v.slug,
  displayName: v.displayName,
  color: v.color,
  createdAt: CREATED_AT,
}));

// ── Public fixtures: insights ───────────────────────────────────────────────
export function demoOverview(): Overview {
  const now = nowMonth();
  const months = monthList(now, 12);
  const completeFlags = completeFlagsFor(months, now);
  const vendors = VENDORS.map(vendorMeta);

  const awaiting = VENDORS.map((v) => {
    const received = hasBill(v.key, now, now);
    const past = months.filter((m) => m !== now && hasBill(v.key, m, now));
    const lastMonth = past[past.length - 1] ?? null;
    return {
      accountId: v.accountId,
      vendor: vendorMeta(v),
      received,
      amount: received ? amountARS(v.key, now) : null,
      usd: received ? usdOf(amountARS(v.key, now), now) : null,
      lastPeriod: lastMonth,
      lastAmount: lastMonth ? amountARS(v.key, lastMonth) : null,
    };
  });
  const received = awaiting.filter((a) => a.received);

  return {
    property: demoProperty,
    month: now,
    thisMonthTotal: received.reduce((s, a) => s + (a.amount ?? 0), 0),
    thisMonthUsd: received.reduce((s, a) => s + (a.usd ?? 0), 0),
    billsIn: received.length,
    billsExpected: awaiting.length,
    awaiting,
    months,
    completeFlags,
    vendors,
    byCurrency: buildByCurrency(months, now),
  };
}

/** Concrete month list for a window, clamped to the demo's own span so the
 * custom range can't wander past "today" or before the fixtures begin. */
function windowMonths(win: InsightsWindow): string[] {
  const now = nowMonth();
  const hi = win.to < now ? win.to : now;
  const lo = win.from > EPOCH ? win.from : EPOCH;
  return monthRange(lo > hi ? hi : lo, hi);
}

export function demoSeries(win: InsightsWindow): Series {
  const now = nowMonth();
  const months = windowMonths(win);
  const completeFlags = completeFlagsFor(months, now);

  const totalIn = (currency: "ARS" | "USD") =>
    months.map((m, i) =>
      completeFlags[i]
        ? VENDORS.reduce(
            (s, v) =>
              s + (hasBill(v.key, m, now) ? valueIn(v.key, m, currency) : 0),
            0,
          )
        : null,
    );

  return {
    months,
    completeFlags,
    vendors: VENDORS.map(vendorMeta),
    byCurrency: buildByCurrency(months, now),
    inflation: {
      arsIdx: rebase(totalIn("ARS")),
      usdIdx: rebase(totalIn("USD")),
    },
    bounds: { earliest: EPOCH, latest: now },
  };
}

// Field metadata per vendor, mirroring what the parser builder would extract.
const FIELD_DEFS: Record<
  VendorKey,
  {
    name: string;
    type: VendorDetail["fields"][number]["type"];
    unit: string | null;
  }[]
> = {
  edesur: [{ name: "Consumo", type: "quantity", unit: "kWh" }],
  metrogas: [{ name: "Consumo", type: "quantity", unit: "m³" }],
  personal: [{ name: "Datos", type: "quantity", unit: "GB" }],
  expensas: [{ name: "Extraordinaria", type: "money", unit: null }],
};

export function demoVendorDetail(
  vendorId: string,
  win: InsightsWindow,
): VendorDetail | null {
  const def = VENDORS.find((v) => v.id === vendorId);
  if (!def) return null;
  const now = nowMonth();
  const months = windowMonths(win);

  const spendIn = (currency: "ARS" | "USD") =>
    months.map((m) =>
      hasBill(def.key, m, now) ? valueIn(def.key, m, currency) : null,
    );

  const fields = FIELD_DEFS[def.key].map((f) => {
    const isMoney = f.type === "money";
    if (f.type === "quantity") {
      const values = months.map((m) =>
        hasBill(def.key, m, now) ? quantity(def.key, m) : null,
      );
      const ars = months.map((m) => {
        const q = hasBill(def.key, m, now) ? quantity(def.key, m) : null;
        return q ? amountARS(def.key, m) / q : null;
      });
      const usd = months.map((m) => {
        const q = hasBill(def.key, m, now) ? quantity(def.key, m) : null;
        return q ? usdOf(amountARS(def.key, m), m) / q : null;
      });
      return {
        name: f.name,
        type: f.type,
        unit: f.unit,
        isMoney: false,
        values,
        valuesUsd: undefined,
        unitPrice: { arsIdx: rebase(ars), usdIdx: rebase(usd) },
      };
    }
    // money surcharge (≈8% of the bill, in pesos with a USD copy)
    const values = months.map((m) =>
      hasBill(def.key, m, now)
        ? Math.round(amountARS(def.key, m) * 0.08)
        : null,
    );
    const valuesUsd = months.map((m, i) =>
      values[i] == null ? null : usdOf(values[i] as number, m),
    );
    return {
      name: f.name,
      type: f.type,
      unit: f.unit,
      isMoney,
      values,
      valuesUsd,
      unitPrice: undefined,
    };
  });

  return {
    vendor: vendorMeta(def),
    months,
    spend: { ARS: spendIn("ARS"), USD: spendIn("USD") },
    fields,
  };
}

// ── Public fixtures: bills ledger ───────────────────────────────────────────
type DemoBillSeed = {
  id: string;
  key: VendorKey | null; // null = unrecognized (needs_review)
  month: string | null;
  status: "parsed" | "needs_review";
};

const UNRECOGNIZED_ID = "d0000000-0000-4000-8000-0000000009ff";

// One parsed bill per vendor per month for the last eight complete months plus
// the current month's received bills, and a single unrecognized upload sitting
// in review. Built relative to `now` so the ledger advances with the calendar.
function billSeeds(now: string): DemoBillSeed[] {
  const ledgerMonths = monthList(now, 9); // includes the current month
  return [
    { id: UNRECOGNIZED_ID, key: null, month: null, status: "needs_review" },
    ...ledgerMonths.flatMap((month, mi) =>
      VENDORS.filter((v) => hasBill(v.key, month, now)).map((v, vi) => ({
        id: `d0000000-0000-4000-8000-0000000${String(900 + mi * 10 + vi).padStart(5, "0")}`,
        key: v.key,
        month,
        status: "parsed" as const,
      })),
    ),
  ];
}

function rawTextFor(seed: DemoBillSeed): string {
  if (!seed.key || !seed.month) {
    return "AySA — Aguas Argentinas\nFactura de servicio\nPeríodo 05/2026\nTotal a pagar $ 9.480,00\n(demo: no parser recognized this layout)";
  }
  const v = VENDOR_BY_KEY.get(seed.key)!;
  const ars = amountARS(seed.key, seed.month);
  const q = quantity(seed.key, seed.month);
  return [
    `${v.displayName}`,
    `Cuenta ${v.slug.toUpperCase()}-0042`,
    `Período de facturación ${seed.month}`,
    q != null ? `Consumo registrado: ${q}` : "",
    `TOTAL A PAGAR  $ ${ars.toLocaleString("es-AR")}`,
    "",
    "— sample bill text shown in the Factura demo —",
  ]
    .filter(Boolean)
    .join("\n");
}

type FullBill = Omit<BillGet, "downloadUrl" | "yoy">;

function seedToFull(seed: DemoBillSeed): FullBill {
  const v = seed.key ? VENDOR_BY_KEY.get(seed.key)! : null;
  const period = seed.month ? `${seed.month}-01` : null;
  const ars = seed.key && seed.month ? amountARS(seed.key, seed.month) : null;
  return {
    id: seed.id,
    createdBy: USER_ID,
    accountId: v?.accountId ?? null,
    vendorId: v?.id ?? null,
    propertyId: seed.status === "parsed" ? PROPERTY_ID : null,
    period,
    totalAmount: ars != null ? ars.toFixed(2) : null,
    currency: "ARS",
    dueDate: period,
    status: seed.status,
    fileName: v ? `${v.slug}-${seed.month}.pdf` : "aysa-2026-05.pdf",
    storageKey: null,
    rawText: rawTextFor(seed),
    textHash: "demo",
    parserKey: v?.slug ?? null,
    parserVersion: v ? "3" : null,
    extra: {},
    createdAt: CREATED_AT,
  };
}

function fullToRow(full: FullBill): PagedRow {
  // listPaged omits the heavy raw text; the rest of the row carries through.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { rawText, ...rest } = full;
  const usdAmount =
    full.totalAmount != null && full.period
      ? usdOf(Number(full.totalAmount), full.period.slice(0, 7))
      : null;
  return { ...rest, usdAmount };
}

// Same ordering the real listPaged applies: review-needed first, then newest period.
function sortRows(rows: PagedRow[]): PagedRow[] {
  return [...rows].sort((a, b) => {
    if ((a.status === "needs_review") !== (b.status === "needs_review"))
      return a.status === "needs_review" ? -1 : 1;
    return (a.period ?? "0") < (b.period ?? "0") ? 1 : -1;
  });
}

export function demoVendorsPresent(): string[] {
  const rows = billSeeds(nowMonth());
  return [
    ...new Set(rows.map((s) => (s.key ? VENDOR_BY_KEY.get(s.key)!.id : null))),
  ].filter((id): id is string => !!id);
}

export function demoListPaged(args: {
  vendorId?: string;
  page: number;
  perPage: number;
}): Paged {
  const all = billSeeds(nowMonth()).map((s) => fullToRow(seedToFull(s)));
  const filtered = args.vendorId
    ? all.filter((r) => r.vendorId === args.vendorId)
    : all;
  const rows = sortRows(filtered);
  const pageCount = Math.max(1, Math.ceil(rows.length / args.perPage));
  const page = Math.min(args.page, pageCount - 1);
  const slice = rows.slice(
    page * args.perPage,
    page * args.perPage + args.perPage,
  );
  return { rows: slice, total: rows.length, page, pageCount };
}

/** bills.get shape for the demo drawer: full bill + raw text, no PDF, plus YoY
 * for parsed bills that have a same-vendor bill twelve months earlier. */
export function demoBill(id: string): BillGet | null {
  const seed = billSeeds(nowMonth()).find((s) => s.id === id);
  if (!seed) return null;
  const full = seedToFull(seed);

  let yoy: BillGet["yoy"] = null;
  if (seed.key && seed.month) {
    const prevMonth = monthList(seed.month, 13)[0]; // 12 months earlier
    const cur = amountARS(seed.key, seed.month);
    const prev = amountARS(seed.key, prevMonth);
    const curUsd = usdOf(cur, seed.month);
    const prevUsd = usdOf(prev, prevMonth);
    yoy = {
      prevPeriod: `${prevMonth}-01`,
      arsPct: ((cur - prev) / prev) * 100,
      usdPct: ((curUsd - prevUsd) / prevUsd) * 100,
    };
  }

  return { ...full, downloadUrl: null, yoy };
}

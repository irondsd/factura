import * as alquiler from "../../estadisticas/data/alquiler-caba";
import * as delitos from "../../estadisticas/data/delitos-caba";

// A safety ranking is only useful if it says *safe from what*. This join keeps
// the three non-overlapping slices published by the crime series separate:
// robbery (with violence), theft (without violence), and offences against
// people. It deliberately does not manufacture a barrio ranking for armed
// robbery: the source's annual city total distinguishes it, but the barrio
// series used by this site does not. A missing breakdown is not a licence to
// infer one from the total.

export const CRIME_YEAR = delitos.LAST_YEAR;
export const RENT_PERIOD_LABEL = alquiler.LAST_UPDATED;
export const TEMPORAL_COVERAGE = `${CRIME_YEAR}-01/${alquiler.LAST_PERIOD.slice(0, 4)}-${String((Number(alquiler.LAST_PERIOD.slice(5)) - 1) * 3 + 1).padStart(2, "0")}`;

export const TYPES = [
  { id: "robos", label: "Robos", detail: "con violencia, incluidos los de automotores" },
  { id: "hurtos", label: "Hurtos", detail: "sin violencia, incluidos los de automotores" },
  { id: "personas", label: "Delitos contra las personas", detail: "lesiones, amenazas y homicidios" },
] as const;

export type ProfileRow = {
  id: string;
  label: string;
  meta: string;
  robos: number;
  hurtos: number;
  personas: number;
  total: number;
  rentMonthly: number | null;
  rentPerMetre: number | null;
};

export const rows = (): ProfileRow[] => {
  const byType = new Map(
    TYPES.map((type) => [type.id, new Map(delitos.rows("barrios", type.id).map((r) => [r.id, r]))]),
  );
  const total = new Map(delitos.rows("barrios", "total").map((r) => [r.id, r]));
  return alquiler.rows("barrios", "amb2").map((rent) => ({
    id: rent.id,
    label: rent.label,
    meta: rent.meta,
    robos: byType.get("robos")!.get(rent.id)!.rate,
    hurtos: byType.get("hurtos")!.get(rent.id)!.rate,
    personas: byType.get("personas")!.get(rent.id)!.rate,
    total: total.get(rent.id)!.rate,
    rentMonthly: rent.monthly,
    rentPerMetre: rent.perMetre,
  }));
};

/** The quietest five barrios in each type; every column is ranked independently. */
export const safestByType = (n = 5): { type: (typeof TYPES)[number]; rows: ProfileRow[] }[] =>
  TYPES.map((type) => ({ type, rows: rows().sort((a, b) => a[type.id] - b[type.id]).slice(0, n) }));

/** A short, fully comparable table: the best overall rows plus the different
 * winners of each category. It prevents one familiar name from standing in for
 * three different distributions. */
export const comparison = (): ProfileRow[] => {
  const all = rows();
  const ids = new Set(all.slice().sort((a, b) => a.total - b.total).slice(0, 8).map((r) => r.id));
  for (const type of TYPES) ids.add(all.slice().sort((a, b) => a[type.id] - b[type.id])[0].id);
  return all.filter((r) => ids.has(r.id)).sort((a, b) => a.total - b.total);
};

export const formatRate = (value: number): string =>
  new Intl.NumberFormat("es-AR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value);

export const formatArs = alquiler.formatArs;

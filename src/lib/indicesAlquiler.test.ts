import { describe, expect, it } from "vitest";
import { INDICES_ALQUILER } from "@/content/guias/data/indices-alquiler";
import {
  addMonths,
  assertIndices,
  calcularTramos,
  iclAt,
  ipcAt,
  tramoVigente,
  type Entrada,
  type Indices,
  type Tramo,
} from "./indicesAlquiler";

// Ten days of ICL from 1 March, and IPC levels from October to March.
const FIXTURE: Indices = {
  icl: {
    start: "2025-03-01",
    values: [2, 2.01, 2.02, 2.03, 2.04, 2.05, 2.06, 2.07, 2.08, 2.1],
  },
  // 2024-10 … 2025-03
  ipc: { start: "2024-10", values: [100, 102, 104, 106, 108, 110] },
};

const fail = (result: ReturnType<typeof calcularTramos>): never => {
  throw new Error(result.ok ? "unexpected" : result.error);
};

const base: Entrada = {
  monto: 100_000,
  inicio: "2024-11-01",
  indice: "ipc",
  cadaMeses: 2,
  duracionMeses: 12,
  desfaseIpc: 0,
};

describe("addMonths", () => {
  it("keeps the day of the month", () => {
    expect(addMonths("2025-01-15", 3)).toBe("2025-04-15");
  });

  it("clamps to the last day of a shorter month, from the original day", () => {
    expect(addMonths("2024-01-31", 1)).toBe("2024-02-29");
    expect(addMonths("2025-01-31", 1)).toBe("2025-02-28");
    expect(addMonths("2025-01-31", 3)).toBe("2025-04-30");
    expect(addMonths("2025-01-31", 4)).toBe("2025-05-31");
  });

  it("crosses years", () => {
    expect(addMonths("2025-11-10", 3)).toBe("2026-02-10");
  });
});

describe("series lookups", () => {
  it("reads a day of the ICL and a month of the IPC", () => {
    expect(iclAt(FIXTURE.icl, "2025-03-01")).toBe(2);
    expect(iclAt(FIXTURE.icl, "2025-03-10")).toBe(2.1);
    expect(iclAt(FIXTURE.icl, "2025-03-11")).toBeNull();
    expect(iclAt(FIXTURE.icl, "2025-02-28")).toBeNull();
    expect(ipcAt(FIXTURE.ipc, "2024-12")).toBe(104);
    expect(ipcAt(FIXTURE.ipc, "2025-04")).toBeNull();
  });
});

describe("calcularTramos with the IPC", () => {
  it("covers the months of the period: a January update uses November–December", () => {
    const result = calcularTramos(base, FIXTURE);
    if (!result.ok) return fail(result);
    const [first, second] = result.tramos;
    expect(first).toMatchObject({ desde: "2024-11-01", monto: 100_000 });
    expect(second.desde).toBe("2025-01-01");
    expect(second.detalle).toEqual({
      indice: "ipc",
      desdeMes: "2024-11",
      hastaMes: "2024-12",
    });
    // Level at end of December over level at end of October.
    expect(second.factor).toBeCloseTo(104 / 100, 10);
    expect(second.monto).toBeCloseTo(104_000, 6);
  });

  it("moves every covered month back one with the desfase", () => {
    const result = calcularTramos(
      { ...base, inicio: "2024-12-01", desfaseIpc: 1 },
      FIXTURE,
    );
    if (!result.ok) return fail(result);
    // A February update covers November–December instead of December–January.
    expect(result.tramos[1].detalle).toEqual({
      indice: "ipc",
      desdeMes: "2024-11",
      hastaMes: "2024-12",
    });
    expect(result.tramos[1].factor).toBeCloseTo(104 / 100, 10);
  });

  it("needs one more month of history with the desfase", () => {
    expect(
      calcularTramos({ ...base, desfaseIpc: 1 }, FIXTURE),
    ).toEqual({ ok: false, error: "antes-de-la-serie", minimo: "2024-12-01" });
  });

  it("marks an update pending when its last month is not published, and every later one with it", () => {
    const result = calcularTramos(base, FIXTURE);
    if (!result.ok) return fail(result);
    // Updates: Jan (Nov–Dec), Mar (Jan–Feb), May (Mar–Apr: April missing).
    expect(result.tramos[2].factor).toBeCloseTo(108 / 104, 10);
    expect(result.tramos[3]).toMatchObject({
      desde: "2025-05-01",
      monto: null,
      factor: null,
      pendiente: { indice: "ipc", mes: "2025-04" },
    });
    expect(result.tramos[4].monto).toBeNull();
    expect(result.tramos.at(-1)!.desde).toBe("2025-09-01");
  });

  it("chains factors so the accumulated rise is the ratio of first and last levels", () => {
    const result = calcularTramos(base, FIXTURE);
    if (!result.ok) return fail(result);
    expect(result.tramos[2].acumulado).toBeCloseTo(108 / 100, 10);
  });

  it("refuses a start the series cannot price", () => {
    expect(calcularTramos({ ...base, inicio: "2024-10-15" }, FIXTURE)).toEqual({
      ok: false,
      error: "antes-de-la-serie",
      minimo: "2024-11-01",
    });
  });
});

describe("calcularTramos with the ICL", () => {
  it("divides the index on the new rent's day by the index on the previous one's", () => {
    const result = calcularTramos(
      {
        ...base,
        indice: "icl",
        inicio: "2025-03-01",
        cadaMeses: 1,
        duracionMeses: 3,
      },
      {
        ...FIXTURE,
        icl: {
          start: "2025-03-01",
          values: Array.from({ length: 62 }, (_, i) => 2 + i / 100),
        },
      },
    );
    if (!result.ok) return fail(result);
    const [, april, may] = result.tramos;
    expect(april.desde).toBe("2025-04-01");
    expect(april.factor).toBeCloseTo(2.31 / 2, 10);
    expect(may.factor).toBeCloseTo(2.61 / 2.31, 10);
    expect(may.acumulado).toBeCloseTo(2.61 / 2, 10);
  });

  it("is pending when the ICL for the update day is not published yet", () => {
    const result = calcularTramos(
      { ...base, indice: "icl", inicio: "2025-03-05", cadaMeses: 1 },
      FIXTURE,
    );
    if (!result.ok) return fail(result);
    expect(result.tramos[1].pendiente).toEqual({
      indice: "icl",
      fecha: "2025-04-05",
    });
  });

  it("refuses a contract that started before the ICL existed", () => {
    const result = calcularTramos(
      { ...base, indice: "icl", inicio: "2025-02-28" },
      FIXTURE,
    );
    expect(result.ok).toBe(false);
  });
});

describe("input errors", () => {
  it("asks for the amount and the date", () => {
    expect(calcularTramos({ ...base, monto: 0 }, FIXTURE)).toEqual({
      ok: false,
      error: "monto",
    });
    expect(calcularTramos({ ...base, inicio: "2025-02-30" }, FIXTURE)).toEqual(
      { ok: false, error: "inicio" },
    );
  });
});

describe("tramoVigente", () => {
  const tramo = (desde: string): Tramo => ({
    desde,
    monto: 1,
    factor: null,
    acumulado: 1,
    detalle: null,
    pendiente: null,
  });
  const tramos = ["2025-01-01", "2025-04-01", "2025-07-01"].map(tramo);

  it("finds the row in force", () => {
    expect(tramoVigente(tramos, "2025-05-10", "2026-01-01")).toBe(1);
    expect(tramoVigente(tramos, "2025-07-01", "2026-01-01")).toBe(2);
  });

  it("is -1 outside the contract", () => {
    expect(tramoVigente(tramos, "2024-12-31", "2026-01-01")).toBe(-1);
    expect(tramoVigente(tramos, "2026-01-01", "2026-01-01")).toBe(-1);
  });
});

describe("the shipped data", () => {
  it("is well formed", () => {
    expect(() =>
      assertIndices(INDICES_ALQUILER, "indices-alquiler.json"),
    ).not.toThrow();
  });

  it("starts where the official series start", () => {
    expect(INDICES_ALQUILER.icl.start).toBe("2020-07-01");
    expect(iclAt(INDICES_ALQUILER.icl, "2020-07-01")).toBe(1);
    expect(INDICES_ALQUILER.ipc.start).toBe("2016-12");
    expect(ipcAt(INDICES_ALQUILER.ipc, "2016-12")).toBe(100);
  });

  it("rejects an ICL value with more than two decimals", () => {
    expect(() =>
      assertIndices(
        { ...FIXTURE, icl: { start: "2025-03-01", values: [2.001] } },
        "test",
      ),
    ).toThrow(/two decimals/);
  });
});

import { describe, expect, it } from "vitest";
import { BARRIOS } from "@/content/shared/caba";
import {
  ADICIONAL,
  calcular,
  CG_MAX,
  CG_MIN,
  COEFICIENTES,
  ESCALA,
  formatCoef,
  formatRango,
  impuestoInmobiliario,
  MINIMO,
  rango,
  segmentoDe,
  tasaAbl,
} from "./abl-caba";

// Typed in by hand from the Ley Impositiva, like `absa-tarifas`, so what these
// tests guard is a transcription slip: a digit wrong in a cuota fija, a
// subzona given to the wrong barrio, a coefficient off the quarter-step grid
// the law uses. The worked examples were done by hand from the law's text, not
// by running the module.

describe("abl-caba: the Impuesto Inmobiliario scale", () => {
  it("is contiguous: each segment starts where the one before it ends", () => {
    for (let i = 1; i < ESCALA.length; i++) {
      expect(ESCALA[i].from).toBe(ESCALA[i - 1].to);
    }
    expect(ESCALA[0].from).toBe(0);
    expect(ESCALA.at(-1)!.to).toBeNull();
  });

  it("has fixed quotas that are the running sum of the segments below", () => {
    // The law prints the cuota fija rather than letting it be derived, and a
    // mistyped one produces a tax that jumps at a boundary. Marginal scales
    // are continuous; this is the check that ours is.
    for (let i = 1; i < ESCALA.length; i++) {
      const prev = ESCALA[i - 1];
      const expected = prev.fixed + (prev.to! - prev.from) * prev.rate;
      expect(ESCALA[i].fixed).toBeCloseTo(expected, 2);
    }
  });

  it("puts a boundary value in the segment it starts", () => {
    expect(segmentoDe(19_150_000).id).toBe("B");
    expect(segmentoDe(19_149_999).id).toBe("A");
    expect(segmentoDe(6_000_000_000).id).toBe("J");
  });

  it("computes art. 41 on a worked example", () => {
    // VFH 50 M is segment D: 256.375 + (50 M − 40 M) × 0,75 %.
    expect(impuestoInmobiliario(50_000_000)).toBeCloseTo(331_375, 2);
  });
});

describe("abl-caba: the coefficient table", () => {
  it("covers all 48 barrios", () => {
    const covered = new Set(COEFICIENTES.map((r) => r.barrio));
    expect(covered.size).toBe(BARRIOS.length);
  });

  it("uses only the law's quarter steps between 0 and 2", () => {
    for (const row of COEFICIENTES) {
      expect(row.cg * 4).toBe(Math.round(row.cg * 4));
      expect(row.cg).toBeGreaterThanOrEqual(0);
      expect(row.cg).toBeLessThanOrEqual(2);
    }
    expect(CG_MIN).toBe(0);
    expect(CG_MAX).toBe(2);
  });

  it("gives a single-coefficient barrio no subzona text", () => {
    for (const b of BARRIOS) {
      const rows = COEFICIENTES.filter((r) => r.barrio === b.id);
      if (rows.length === 1) expect(rows[0].tramo, b.id).toBeNull();
      else for (const r of rows) expect(r.tramo, b.id).not.toBeNull();
    }
  });

  it("reads the ranges of the barrios the law splits across zones", () => {
    expect(rango("palermo")).toMatchObject({ min: 1.25, max: 2, subzonas: 7 });
    expect(rango("palermo").zonas).toEqual(["II", "III"]);
    expect(rango("flores")).toMatchObject({ min: 0.25, max: 1, subzonas: 5 });
    expect(rango("flores").zonas).toEqual(["I", "II"]);
    expect(rango("puerto-madero")).toMatchObject({ min: 2, max: 2 });
    expect(rango("barracas")).toMatchObject({ min: 0, max: 0.25 });
  });
});

describe("abl-caba: the calculation", () => {
  it("computes art. 42 on a worked example", () => {
    // 50 M × 0,80 % × (1 + 1,50 × 0,5) = 50 M × 0,8 % × 1,75 = 700.000.
    expect(tasaAbl(50_000_000, 1.5)).toBeCloseTo(700_000, 2);
    // A coefficient of zero leaves the base alícuota alone.
    expect(tasaAbl(10_000_000, 0)).toBeCloseTo(80_000, 2);
  });

  it("adds the 1 % surcharge only above the threshold", () => {
    const above = calcular({ vfh: 50_000_000, cg: 1.5 });
    expect(above.adicional).toBeCloseTo(7_000, 2);
    expect(above.total).toBeCloseTo(331_375 + 700_000 + 7_000, 2);
    expect(above.cuota).toBeCloseTo(above.total / 12, 6);

    const at = calcular({ vfh: ADICIONAL.threshold, cg: 1 });
    expect(at.adicional).toBe(0);
  });

  it("raises each tribute to half of the minimum", () => {
    const tiny = calcular({ vfh: 500_000, cg: 0 });
    expect(tiny.minimo).toBe(true);
    expect(tiny.inmobiliario).toBe(MINIMO.general / 2);
    expect(tiny.tasa).toBe(MINIMO.general / 2);
    expect(tiny.total).toBe(MINIMO.general);

    const garage = calcular({ vfh: 100_000, cg: 1, complementaria: true });
    expect(garage.total).toBe(MINIMO.complementaria);

    expect(calcular({ vfh: 30_000_000, cg: 1 }).minimo).toBe(false);
  });
});

describe("abl-caba: formatting", () => {
  it("writes coefficients the way the law does", () => {
    expect(formatCoef(1.5)).toBe("1,50");
    expect(formatRango(0.75, 1)).toBe("0,75–1,00");
    expect(formatRango(2, 2)).toBe("2,00");
  });
});

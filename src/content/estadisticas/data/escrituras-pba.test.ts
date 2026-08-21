import { describe, expect, it } from "vitest";
import {
  compraventas,
  FIRST_PERIOD,
  FLAGGED,
  formatCount,
  formatPct,
  formatShare,
  FULL_YEARS,
  hipotecas,
  hipotecaShare,
  hipotecaShare12,
  LAST_PERIOD,
  MIN_ACTS_FOR_RATIO,
  monto,
  PERIODS,
  periodLabel,
  promedioUsd,
  rolling12,
  seasonality,
  YEAR_EXTREMES,
  YEARS,
  yoy,
} from "./escrituras-pba";

// The dataset is rebuilt by a script that parses a PDF whose column count has
// already changed twice, and the failure that matters is not a crash — it is a
// column read one position over, which still yields 258 consecutive months of
// plausible numbers. These tests pin the things that would still *look* fine
// after that kind of drift, plus the two derived readings the page leans on.

describe("escrituras-pba", () => {
  it("is a gapless monthly axis", () => {
    const ord = (p: string) =>
      Number(p.slice(0, 4)) * 12 + Number(p.slice(5, 7)) - 1;
    for (let i = 1; i < PERIODS.length; i++) {
      expect(ord(PERIODS[i]), `${PERIODS[i - 1]} → ${PERIODS[i]}`).toBe(
        ord(PERIODS[i - 1]) + 1,
      );
    }
    expect(new Set(PERIODS).size).toBe(PERIODS.length);
    expect(FIRST_PERIOD).toBe("2005-01");
  });

  it("keeps every monthly count in a plausible range", () => {
    // The realistic corruption is a thousands separator read as a decimal
    // point, which lands three orders of magnitude out rather than slightly
    // off. April 2020 — one deed in the whole province — is the one month
    // that genuinely sits below any floor, so it is named rather than
    // bracketed away.
    for (const period of PERIODS) {
      const n = compraventas(period);
      expect(Number.isInteger(n), period).toBe(true);
      expect(n, period).toBeLessThan(40_000);
      if (period !== "2020-04" && period !== "2020-05") {
        expect(n, period).toBeGreaterThan(1_000);
      }
    }
    expect(compraventas("2020-04")).toBe(1);
  });

  it("never reports more hipotecas than the source can support", () => {
    // If the parser slipped a column, the hipoteca series would pick up
    // compraventa-sized figures. It has never come close to parity on a
    // twelve-month basis in twenty-one years.
    for (const period of PERIODS.slice(11)) {
      const share = hipotecaShare12(period)!;
      expect(share, period).toBeGreaterThan(0);
      expect(share, period).toBeLessThan(0.5);
    }
  });

  it("holds the monthly ratio back on a month too small to divide by", () => {
    expect(hipotecaShare("2020-04")).toBeNull();
    expect(compraventas("2020-04")).toBeLessThan(MIN_ACTS_FOR_RATIO);
    expect(hipotecaShare(LAST_PERIOD)).not.toBeNull();
  });

  it("rolls twelve months, and only twelve", () => {
    expect(rolling12(PERIODS[10])).toBeNull();
    const at = PERIODS[11];
    const byHand = PERIODS.slice(0, 12).reduce(
      (s, p) => s + compraventas(p),
      0,
    );
    expect(rolling12(at)).toBe(byHand);
  });

  it("compares a month with the same month a year earlier", () => {
    expect(yoy(PERIODS[11])).toBeNull();
    const at = PERIODS[12];
    expect(yoy(at)).toBeCloseTo(
      compraventas(at) / compraventas(PERIODS[0]) - 1,
      12,
    );
  });

  it("adds each year's months up to that year's own total", () => {
    for (const y of YEARS) {
      const months = PERIODS.filter((p) => p.startsWith(String(y.year)));
      expect(months.length, String(y.year)).toBe(y.months);
      expect(
        months.reduce((s, p) => s + compraventas(p), 0),
        String(y.year),
      ).toBe(y.compraventas);
      expect(
        months.reduce((s, p) => s + hipotecas(p), 0),
        String(y.year),
      ).toBe(y.hipotecas);
    }
  });

  it("ranks only complete years", () => {
    expect(FULL_YEARS.every((y) => y.months === 12)).toBe(true);
    expect(FULL_YEARS).toContain(YEAR_EXTREMES.high);
    expect(FULL_YEARS).toContain(YEAR_EXTREMES.low);
    // The pandemic year is the floor of the series and nothing else is close.
    expect(YEAR_EXTREMES.low.year).toBe(2020);
  });

  it("keeps the strike month out of the monthly minimum but in the data", () => {
    expect([...FLAGGED.keys()]).toContain("2007-12");
    // It is real data — half the December either side of it, not zero.
    expect(compraventas("2007-12")).toBeGreaterThan(0);
    expect(compraventas("2007-12")).toBeLessThan(compraventas("2006-12") / 2);
  });

  it("describes a year that sums to one whole", () => {
    const season = seasonality();
    expect(season).toHaveLength(12);
    expect(season.reduce((s, r) => s + r.share, 0)).toBeCloseTo(1, 6);
    // December is the peak of the calendar and January the trough, which is
    // the whole reason the page never compares a month with the one before.
    const high = season.reduce((a, r) => (r.share > a.share ? r : a));
    const low = season.reduce((a, r) => (r.share < a.share ? r : a));
    expect(high.month).toBe(12);
    expect(low.month).toBe(1);
    expect(high.share / low.share).toBeGreaterThan(2);
  });

  it("prices a deed in dollars only where there is a rate", () => {
    expect(promedioUsd("2005-01")).toBeNull();
    const usd = promedioUsd(LAST_PERIOD);
    expect(usd).not.toBeNull();
    // An average deed in the province is a five-figure dollar sum. A wrong
    // divisor — the official rate against the blue during the cepo — moves it
    // by a factor of two, not out of this band, so this only catches gross
    // errors, which is what it is for.
    expect(usd!).toBeGreaterThan(5_000);
    expect(usd!).toBeLessThan(500_000);
    expect(monto(LAST_PERIOD)).toBeGreaterThan(0);
  });

  it("formats in Argentine Spanish", () => {
    expect(formatCount(147393)).toBe("147.393");
    expect(formatPct(0.126)).toBe("+12,6 %");
    expect(formatPct(-0.086)).toBe("-8,6 %");
    expect(formatShare(0.159)).toBe("15,9 %");
    expect(periodLabel("2026-06")).toBe("junio de 2026");
  });
});

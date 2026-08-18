import { describe, expect, it } from "vitest";
import { PARTIDOS, PRICED, partidosOfZona, ZONAS } from "@/content/shared/pba";
import {
  BREAKS,
  classOf,
  coverage,
  formatPct,
  formatUsd,
  LAST_PERIOD,
  PERIODS,
  periodShort,
  ranked,
  rankOf,
  REFERENCE_AREA,
  rows,
  totalPrice,
  unidadMedia,
  value,
  ZONA_SERIES_BREAK,
  zonaIndex,
  zonas,
} from "./venta-pba";

// The dataset is refreshed by a script that parses PDFs off a commercial site,
// and the failure mode that matters is not a crash — it is a plausible-looking
// number in the wrong row. These tests pin the things that would still *look*
// fine if the parser drifted: that every priced partido is present, that the
// aggregate whose meaning changed is never read across the break, and that the
// shading scale actually splits the data instead of putting everything in one
// class.

describe("venta-pba", () => {
  it("covers every partido the registry says is priced", () => {
    const ids = rows().map((r) => r.id);
    expect(ids.sort()).toEqual(PRICED.map((p) => p.id).sort());
  });

  it("has a figure for every partido in the latest period", () => {
    // Not a law of the dataset — a report can skip a month — but it is true
    // now, and if it stops being true the page's coverage note changes.
    const { withData, total, missing } = coverage();
    expect(missing).toEqual([]);
    expect(withData).toBe(total);
  });

  it("keeps every partido's price in a plausible range", () => {
    // A decimal-separator bug in the parser (2.368 read as 2,368 → 2368 vs
    // 2.368) is the realistic corruption, and it lands two orders of magnitude
    // out rather than slightly off.
    for (const period of PERIODS) {
      for (const r of rows(period)) {
        if (r.usd === null) continue;
        expect(r.usd, `${r.id} in ${period}`).toBeGreaterThan(300);
        expect(r.usd, `${r.id} in ${period}`).toBeLessThan(10000);
      }
    }
  });

  it("keeps annual variation within a believable band", () => {
    for (const period of PERIODS) {
      for (const r of rows(period)) {
        if (r.anual === null) continue;
        expect(Math.abs(r.anual), `${r.id} in ${period}`).toBeLessThan(80);
      }
    }
  });

  it("assigns every partido to a zona that knows about it", () => {
    for (const z of ZONAS) {
      for (const p of partidosOfZona(z.id)) {
        expect(p.zona).toBe(z.id);
      }
    }
    const grouped = ZONAS.flatMap((z) => partidosOfZona(z.id)).length;
    expect(grouped).toBe(PRICED.length);
  });

  it("never reads the oeste aggregate across the definition break", () => {
    // "GBA OESTE" meant oeste+sur before the split and oeste alone after.
    // Reading one key on both sides would draw a definition change as a price
    // change — see ZONA_SERIES_BREAK in the module header.
    const before = PERIODS.filter((p) => p < ZONA_SERIES_BREAK);
    const after = PERIODS.filter((p) => p >= ZONA_SERIES_BREAK);
    expect(before.length).toBeGreaterThan(0);
    expect(after.length).toBeGreaterThan(0);
    for (const p of before) expect(zonaIndex("oeste", p).key).toBe("oeste-sur");
    for (const p of after) expect(zonaIndex("oeste", p).key).toBe("oeste");
    // Norte was never restructured, so it reads one key throughout.
    for (const p of PERIODS) expect(zonaIndex("norte", p).key).toBe("norte");
  });

  it("ranks dearest first with the withheld last", () => {
    const order = ranked();
    const withValue = order.filter((r) => r.usd !== null);
    for (let i = 1; i < withValue.length; i++) {
      expect(withValue[i - 1].usd as number).toBeGreaterThanOrEqual(
        withValue[i].usd as number,
      );
    }
    // Anything without a figure sorts after everything with one.
    const firstNull = order.findIndex((r) => r.usd === null);
    if (firstNull !== -1) {
      expect(order.slice(firstNull).every((r) => r.usd === null)).toBe(true);
    }
    expect(rankOf(withValue[0].id)).toBe(1);
  });

  it("spreads the partidos across the shading scale", () => {
    // A scale copied from the CABA page would put most of these in one class,
    // which is the bug this exists to catch on a future refresh.
    const used = new Set(
      rows()
        .filter((r) => r.usd !== null)
        .map((r) => classOf(r.usd as number)),
    );
    expect(used.size).toBeGreaterThanOrEqual(4);
    expect(classOf(BREAKS[0] - 1)).toBe(0);
    expect(classOf(BREAKS[BREAKS.length - 1] + 1)).toBe(BREAKS.length);
  });

  it("summarises each zona from its own partidos", () => {
    for (const z of zonas()) {
      expect(z.count).toBeGreaterThan(0);
      expect(z.top).not.toBeNull();
      expect(z.bottom).not.toBeNull();
      expect(z.top!.usd as number).toBeGreaterThanOrEqual(
        z.bottom!.usd as number,
      );
      expect(z.median).not.toBeNull();
      expect(z.median as number).toBeLessThanOrEqual(z.top!.usd as number);
      expect(z.median as number).toBeGreaterThanOrEqual(
        z.bottom!.usd as number,
      );
    }
  });

  it("publishes a unit-media price for every zona", () => {
    for (const z of ZONAS) {
      const { amb2, amb3 } = unidadMedia(z.id);
      expect(amb2, `${z.id} amb2`).not.toBeNull();
      expect(amb3, `${z.id} amb3`).not.toBeNull();
    }
  });

  it("rounds a unit price to the nearest thousand", () => {
    expect(totalPrice(1523, REFERENCE_AREA.amb2)).toBe(76000);
    expect(totalPrice(2385, REFERENCE_AREA.amb2)).toBe(119000);
    expect(totalPrice(1000, 70)).toBe(70000);
  });

  it("formats in Argentine convention", () => {
    expect(formatUsd(2368)).toBe("US$ 2.368");
    expect(formatPct(5.5)).toBe("+5,5 %");
    expect(formatPct(-1.2)).toBe("-1,2 %");
    expect(periodShort("2026-06")).toBe("jun 26");
  });

  it("throws rather than guessing on an unknown period", () => {
    expect(() => value("tigre", "usd", "1999-01")).toThrow(/unknown period/);
  });

  it("has a period axis in order, with no duplicates", () => {
    expect([...PERIODS].sort()).toEqual([...PERIODS]);
    expect(new Set(PERIODS).size).toBe(PERIODS.length);
    expect(LAST_PERIOD).toBe(PERIODS[PERIODS.length - 1]);
  });

  it("prices only a subset of the province", () => {
    // The page's whole framing — "the map ends where the data ends" — depends
    // on this staying true. If a portal ever priced all 135, the prose changes.
    expect(PRICED.length).toBeLessThan(PARTIDOS.length);
  });
});

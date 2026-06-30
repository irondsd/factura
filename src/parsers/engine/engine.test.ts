import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { normalize } from "../normalize";
import { dominijanniExpensasConfig } from "./configs/dominijanni-expensas";
import { edesurConfig } from "./configs/edesur";
import { ENGINE_CONFIGS } from "./configs";
import { mdaExpensasConfig } from "./configs/mda-expensas";
import { metrogasConfig } from "./configs/metrogas";
import { telecomConfig } from "./configs/telecom";
import { evalExpr } from "./expr";
import { runConfig, selectConfig } from "./evaluate";
import { applyTransforms } from "./transforms";
import { ParseError, type ParserConfig } from "./types";

function fixture(name: string): string {
  return normalize(
    readFileSync(join(__dirname, "..", "__fixtures__", `${name}.txt`), "utf8"),
  );
}

describe("expr (safe expression language)", () => {
  it("evaluates arithmetic with precedence", () => {
    expect(evalExpr("(bim - 1) * 2 + half", { bim: 3, half: 1 })).toBe(5);
  });

  it("evaluates a ternary", () => {
    expect(evalExpr("m > d ? y - 1 : y", { m: 12, d: 1, y: 2026 })).toBe(2025);
    expect(evalExpr("m > d ? y - 1 : y", { m: 1, d: 5, y: 2026 })).toBe(2026);
  });

  it("propagates undefined when an identifier is absent", () => {
    expect(evalExpr("(bim - 1) * 2 + half", { bim: 3 })).toBeUndefined();
  });

  it("coerces numeric strings", () => {
    expect(evalExpr("a * 100", { a: "417.1" })).toBeCloseTo(41710);
  });
});

describe("compute: when/use presence gate", () => {
  const cfg = (): ParserConfig => ({
    slug: "t",
    version: 1,
    vendor: { slug: "t", displayName: "T" },
    detect: { allOf: [{ pattern: "BILL" }] },
    captures: [
      {
        pattern: "DUE (\\d{2}/\\d{2}/\\d{4})",
        outputs: { due: { group: 1, transform: [{ parseDate: "DMY" }] } },
      },
      {
        pattern: "PER (\\d{2}/\\d{4})",
        outputs: { per: { group: 1, transform: ["monthYear"] } },
      },
      {
        pattern: "BIM (\\d+)",
        outputs: { bim: { group: 1, transform: ["toInt"] } },
      },
      {
        pattern: "MON (\\d+)",
        outputs: { mon: { group: 1, transform: ["toInt"] } },
      },
      {
        pattern: "USED ([\\d.]+)",
        outputs: { kwh: { group: 1, transform: ["numberUS"] } },
      },
    ],
    compute: [
      { name: "bimMonths", when: "bim", use: 2 },
      { name: "monMonths", when: "mon", use: 1 },
      { name: "months", coalesce: ["bimMonths", "monMonths"] },
      { name: "perMonth", expr: "kwh / months" },
    ],
    roles: {
      identity: { sources: ["kwh"] },
      amount: { sources: ["kwh"] },
      period: { sources: ["per"] },
      dueDate: { sources: ["due"] },
    },
    custom: [{ name: "perMonth", source: "perMonth", type: "number" }],
  });

  it("halves a bimonthly total, leaves a monthly one untouched", () => {
    const bim = runConfig(
      cfg(),
      "BILL\nDUE 10/04/2025\nPER 02/2025\nBIM 2\nUSED 240",
    );
    expect(bim.custom.perMonth).toBe(120);
    const mon = runConfig(
      cfg(),
      "BILL\nDUE 20/05/2025\nPER 05/2025\nMON 5\nUSED 132",
    );
    expect(mon.custom.perMonth).toBe(132);
  });
});

describe("transforms", () => {
  it("monthYear normalizes any order/separator to first of month", () => {
    expect(applyTransforms("09-2025", ["monthYear"])).toBe("2025-09-01");
    expect(applyTransforms("09/2025", ["monthYear"])).toBe("2025-09-01");
    expect(applyTransforms("9-2025", ["monthYear"])).toBe("2025-09-01");
    expect(applyTransforms("2025-09", ["monthYear"])).toBe("2025-09-01");
  });

  it("monthYearEs maps every Spanish month to the right number", () => {
    const cases: [string, string][] = [
      ["enero 2026", "2026-01-01"],
      ["febrero 2026", "2026-02-01"],
      ["marzo 2026", "2026-03-01"],
      ["abril 2026", "2026-04-01"],
      ["mayo 2026", "2026-05-01"],
      ["junio 2026", "2026-06-01"],
      ["julio 2026", "2026-07-01"],
      ["agosto 2026", "2026-08-01"],
      ["septiembre 2026", "2026-09-01"],
      ["octubre 2026", "2026-10-01"],
      ["noviembre 2026", "2026-11-01"],
      ["diciembre 2026", "2026-12-01"],
    ];
    for (const [input, expected] of cases) {
      expect(applyTransforms(input, ["monthYearEs"])).toBe(expected);
    }
  });

  it("monthYearEs accepts abbreviations, casing and any order", () => {
    expect(applyTransforms("ABRIL-2026", ["monthYearEs"])).toBe("2026-04-01");
    expect(applyTransforms("abr. 2026", ["monthYearEs"])).toBe("2026-04-01");
    expect(applyTransforms("Jun 2026", ["monthYearEs"])).toBe("2026-06-01");
    expect(applyTransforms("2026 Diciembre", ["monthYearEs"])).toBe(
      "2026-12-01",
    );
    // Both accepted spellings of September resolve to 09.
    expect(applyTransforms("sep 2026", ["monthYearEs"])).toBe("2026-09-01");
    expect(applyTransforms("setiembre 2026", ["monthYearEs"])).toBe(
      "2026-09-01",
    );
  });

  it("monthYearEs passes undefined through untouched", () => {
    expect(applyTransforms(undefined, ["monthYearEs"])).toBeUndefined();
  });

  it("monthYearEs throws ParseError on malformed input", () => {
    // No 4-digit year.
    expect(() => applyTransforms("ABRIL-26", ["monthYearEs"])).toThrow(
      ParseError,
    );
    // No month name (numeric month — that's monthYear's job).
    expect(() => applyTransforms("04-2026", ["monthYearEs"])).toThrow(
      ParseError,
    );
    // A word that isn't a Spanish month.
    expect(() => applyTransforms("Foo 2026", ["monthYearEs"])).toThrow(
      ParseError,
    );
  });
});

describe("detection (step 1)", () => {
  const cases = [
    ["edesur", "edesur"],
    ["metrogas", "metrogas"],
    ["telecom", "telecom"],
    ["mda-expensas", "mda-expensas"],
    ["dominijanni-expensas", "dominijanni-expensas"],
    ["expensas-cantarelli", "mda-expensas"],
    ["expensas-recibo", "mda-expensas"],
  ] as const;

  for (const [file, slug] of cases) {
    it(`routes ${file} -> ${slug}`, () => {
      expect(selectConfig(ENGINE_CONFIGS, fixture(file))?.slug).toBe(slug);
    });
  }

  it("returns undefined for unknown text", () => {
    expect(
      selectConfig(ENGINE_CONFIGS, "Some random shop receipt 123"),
    ).toBeUndefined();
  });

  it("has unique slugs", () => {
    const slugs = ENGINE_CONFIGS.map((c) => c.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});

describe("edesur (barcode + dual period dialect)", () => {
  const r = runConfig(edesurConfig, fixture("edesur"));

  it("extracts everything from barcode + labels", () => {
    expect(r.identity).toBe("1234567");
    expect(r.amount).toBe(22590.52);
    expect(r.dueDate).toBe("2026-06-01");
    expect(r.period).toBe("2026-05-01");
    expect(r.custom.consumption).toEqual({ value: 120, unit: "kWh" });
    expect(r.custom.lateSurcharge).toBe(152.13);
  });

  it("throws on barcode/label amount mismatch", () => {
    const tampered = fixture("edesur").replaceAll("22,590.52", "99,999.99");
    expect(() => runConfig(edesurConfig, tampered)).toThrow(ParseError);
  });

  it("parses $0 bills without a barcode via labels", () => {
    const z = runConfig(edesurConfig, fixture("edesur-no-barcode"));
    expect(z.identity).toBe("1234567");
    expect(z.amount).toBe(0);
    expect(z.dueDate).toBe("2026-01-28");
    expect(z.period).toBe("2026-01-01");
    expect(z.custom.consumption).toEqual({ value: 136, unit: "kWh" });
    expect(z.custom.lateSurcharge).toBeUndefined();
  });

  it("maps old bimonthly tramo labels to the right month", () => {
    const base = fixture("edesur");
    const t1 = runConfig(
      edesurConfig,
      base.replace(
        "Periodo liquidado 5",
        "Periodo liquidado 1er tramo del bim. 03/2025",
      ),
    );
    expect(t1.period).toBe("2025-05-01");
    const t2 = runConfig(
      edesurConfig,
      base.replace(
        "Periodo liquidado 5",
        "Periodo liquidado 2do tramo del bim. 03/2025",
      ),
    );
    expect(t2.period).toBe("2025-06-01");
  });
});

describe("metrogas (label-anchored, AR amounts)", () => {
  const r = runConfig(metrogasConfig, fixture("metrogas"));

  it("extracts fields", () => {
    expect(r.identity).toBe("40009999999");
    expect(r.amount).toBe(6778.1);
    expect(r.dueDate).toBe("2026-05-18");
    expect(r.period).toBe("2026-03-01");
    expect(r.custom.consumption).toEqual({ value: 2.17, unit: "m3" });
  });
});

describe("telecom (masked total, digit-line cross-check)", () => {
  const r = runConfig(telecomConfig, fixture("telecom"));

  it("anchors on saldo total, not the masked stub", () => {
    expect(r.identity).toBe("3000699999990001");
    expect(r.amount).toBe(41710);
    expect(r.dueDate).toBe("2026-06-10");
    expect(r.period).toBe("2026-06-01");
  });

  it("throws when the digit line contradicts the label", () => {
    const tampered = fixture("telecom").replace(
      "Tu saldo total es de $ 41.710,00",
      "Tu saldo total es de $ 55.555,55",
    );
    expect(() => runConfig(telecomConfig, tampered)).toThrow(ParseError);
  });
});

describe("mda expensas (composite identity, extraordinarias)", () => {
  it("extracts fields including extraordinarias", () => {
    const r = runConfig(mdaExpensasConfig, fixture("mda-expensas"));
    expect(r.identity).toBe("30-88888888-9:4A");
    expect(r.amount).toBe(362675.09);
    expect(r.custom.extraordinary).toBe(154500);
    expect(r.dueDate).toBe("2026-06-10");
    expect(r.period).toBe("2026-06-01");
  });

  it("maps a previous administrator's cupón to the same identity", () => {
    const r = runConfig(mdaExpensasConfig, fixture("expensas-cantarelli"));
    expect(r.identity).toBe("30-88888888-9:4A");
    expect(r.amount).toBe(115372.09);
    expect(r.custom.extraordinary).toBe(41220.6);
    expect(r.dueDate).toBe("2024-02-12");
    expect(r.period).toBe("2024-02-01");
  });

  it("ignores a unit-like string in the administrator's office address", () => {
    const tricky = fixture("expensas-cantarelli").replace(
      'CALLE ADMIN 100 "PB - C", CABA',
      "CALLE ADMIN 46 - 4° B, CABA",
    );
    expect(runConfig(mdaExpensasConfig, tricky).identity).toBe(
      "30-88888888-9:4A",
    );
  });

  it("parses the post-payment recibo the same as a cupón", () => {
    const r = runConfig(mdaExpensasConfig, fixture("expensas-recibo"));
    expect(r.identity).toBe("30-88888888-9:4A");
    expect(r.amount).toBe(420308.09);
    expect(r.custom.extraordinary).toBe(154500);
    expect(r.dueDate).toBe("2025-12-10");
    expect(r.period).toBe("2025-12-01");
  });
});

describe("dominijanni expensas (region slice, arrears)", () => {
  const r = runConfig(
    dominijanniExpensasConfig,
    fixture("dominijanni-expensas"),
  );

  it("reads the current aviso, not the embedded prior receipt", () => {
    expect(r.identity).toBe("30-99999999-5:0016");
    expect(r.amount).toBe(165347.16);
    expect(r.dueDate).toBe("2026-06-15");
    expect(r.period).toBe("2026-05-01");
    expect(r.custom.extraordinary).toBeUndefined();
  });
});

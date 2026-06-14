import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { normalize } from "./normalize";
import { findParser, parserRegistry } from "./registry";
import { edesurParser } from "./edesur";
import { metrogasParser } from "./metrogas";
import { telecomParser } from "./telecom";
import { mdaExpensasParser } from "./mda-expensas";
import { dominijanniExpensasParser } from "./dominijanni-expensas";
import { ParseError } from "./types";

function fixture(name: string): string {
  return normalize(
    readFileSync(join(__dirname, "__fixtures__", `${name}.txt`), "utf8"),
  );
}

describe("normalize", () => {
  it("rejoins split diacritics", () => {
    expect(normalize("Liquidaci ó n de Servicios P ú blicos")).toBe(
      "Liquidación de Servicios Públicos",
    );
  });

  it("rejoins diacritics even with multiple spaces between tokens", () => {
    expect(normalize("Liquidaci   ó   n   de   Servicios")).toBe(
      "Liquidación de Servicios",
    );
    expect(normalize("TOTAL   A   PAGAR  (1   °   vencimiento)")).toBe(
      "TOTAL A PAGAR (1° vencimiento)",
    );
  });

  it("strips 2D-barcode glyph runs but keeps digit lines", () => {
    const text = "TOTAL ŸĺŖŖŖĺŸùüŵĒĥČýĔĝļĳĪ 0090001234567 $ 22,590.52";
    const result = normalize(text);
    expect(result).not.toContain("ŸĺŖŖŖĺŸ");
    expect(result).toContain("0090001234567");
  });

  it("normalizes degree signs", () => {
    expect(normalize("1 ° Vencimiento N ° 05")).toBe("1° Vencimiento N° 05");
  });
});

describe("registry detection", () => {
  const cases = [
    ["edesur", "edesur"],
    ["metrogas", "metrogas"],
    ["telecom", "telecom"],
    ["mda-expensas", "mda-expensas"],
    ["dominijanni-expensas", "dominijanni-expensas"],
  ] as const;

  for (const [file, key] of cases) {
    it(`detects ${key}`, () => {
      expect(findParser(fixture(file))?.key).toBe(key);
    });
  }

  it("detects nothing for unknown text", () => {
    expect(findParser("Some random shop receipt 123")).toBeUndefined();
  });

  it("has unique keys", () => {
    const keys = parserRegistry.map((p) => p.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("edesur (barcode-first, US amounts)", () => {
  const fields = edesurParser.parse(fixture("edesur"));

  it("extracts everything from the barcode + labels", () => {
    expect(fields.accountNumber).toBe("1234567");
    expect(fields.totalAmount).toBe(22590.52);
    expect(fields.dueDate).toBe("2026-06-01");
    expect(fields.period).toBe("2026-05-01");
    expect(fields.consumption).toEqual({ value: 120, unit: "kWh" });
    expect(fields.extra?.lateSurcharge).toBe(152.13);
  });

  it("throws on barcode/label amount mismatch", () => {
    const tampered = fixture("edesur").replaceAll("22,590.52", "99,999.99");
    expect(() => edesurParser.parse(tampered)).toThrow(ParseError);
  });

  it("parses $0 bills without a payment barcode via labels", () => {
    const fields = edesurParser.parse(fixture("edesur-no-barcode"));
    expect(fields.accountNumber).toBe("1234567");
    expect(fields.totalAmount).toBe(0);
    expect(fields.dueDate).toBe("2026-01-28");
    expect(fields.period).toBe("2026-01-01");
    expect(fields.consumption).toEqual({ value: 136, unit: "kWh" });
    expect(fields.extra?.noBarcode).toBe(true);
  });

  it("maps old bimonthly tramo labels to the right month", () => {
    // bimester 3 = May+June; tramo decides which half
    const base = fixture("edesur");
    const t1 = edesurParser.parse(
      base.replace(
        "Periodo liquidado 5",
        "Periodo liquidado 1er tramo del bim. 03/2025",
      ),
    );
    expect(t1.period).toBe("2025-05-01");
    const t2 = edesurParser.parse(
      base.replace(
        "Periodo liquidado 5",
        "Periodo liquidado 2do tramo del bim. 03/2025",
      ),
    );
    expect(t2.period).toBe("2025-06-01");
  });
});

describe("metrogas (label-anchored, AR amounts)", () => {
  const fields = metrogasParser.parse(fixture("metrogas"));

  it("extracts fields", () => {
    expect(fields.accountNumber).toBe("40009999999");
    expect(fields.totalAmount).toBe(6778.1);
    expect(fields.dueDate).toBe("2026-05-18");
    // Liquidated range 04/03–04/04 -> period is the start month
    expect(fields.period).toBe("2026-03-01");
    expect(fields.periodLabel).toMatch(/LIQUIDACIÓN 1 DE 2 DEL BIMESTRE/i);
    expect(fields.consumption).toEqual({ value: 2.17, unit: "m3" });
  });
});

describe("telecom (masked total, AR amounts)", () => {
  const fields = telecomParser.parse(fixture("telecom"));

  it("anchors on saldo total, not the masked stub", () => {
    expect(fields.accountNumber).toBe("3000699999990001");
    expect(fields.totalAmount).toBe(41710);
    expect(fields.dueDate).toBe("2026-06-10");
    expect(fields.period).toBe("2026-06-01");
  });

  it("throws when the digit line contradicts the label", () => {
    const tampered = fixture("telecom").replace(
      "Tu saldo total es de $ 41.710,00",
      "Tu saldo total es de $ 55.555,55",
    );
    expect(() => telecomParser.parse(tampered)).toThrow(ParseError);
  });
});

describe("mda expensas (constructed account, extraordinarias)", () => {
  const fields = mdaExpensasParser.parse(fixture("mda-expensas"));

  it("extracts fields including extraordinarias", () => {
    expect(fields.accountNumber).toBe("30-88888888-9:4A");
    expect(fields.totalAmount).toBe(362675.09);
    expect(fields.extraordinaryAmount).toBe(154500);
    expect(fields.dueDate).toBe("2026-06-10");
    expect(fields.period).toBe("2026-06-01"); // "Vencimiento: Jun. 2026"
  });
});

describe("expensas cupón format from a previous administrator", () => {
  const fields = mdaExpensasParser.parse(fixture("expensas-cantarelli"));

  it("is detected by the same parser despite a different administrator", () => {
    expect(findParser(fixture("expensas-cantarelli"))?.key).toBe(
      "mda-expensas",
    );
  });

  it("maps to the SAME account as current-administrator bills", () => {
    const current = mdaExpensasParser.parse(fixture("mda-expensas"));
    // "04-A" (old) and "4° A" (new) must both normalize to the same unit
    expect(fields.accountNumber).toBe(current.accountNumber);
  });

  it("ignores a unit-like string in the administrator's office address", () => {
    // Real case: the administrator moved to "MEDRANO 46 - 4° B, CABA", which
    // appears before the actual unit ("009 04-A") in the text
    const tricky = fixture("expensas-cantarelli").replace(
      "CALLE ADMIN 100 \"PB - C\", CABA",
      "CALLE ADMIN 46 - 4° B, CABA",
    );
    expect(mdaExpensasParser.parse(tricky).accountNumber).toBe(
      "30-88888888-9:4A",
    );
  });

  it("extracts fields", () => {
    expect(fields.totalAmount).toBe(115372.09);
    expect(fields.extraordinaryAmount).toBe(41220.6);
    expect(fields.dueDate).toBe("2024-02-12");
    expect(fields.period).toBe("2024-02-01"); // "Vencimiento: Feb. 2024"
  });
});

describe("expensas recibo de pago (post-payment receipt)", () => {
  const text = fixture("expensas-recibo");

  it("is detected by the cupón/recibo parser, not confused with dominijanni", () => {
    expect(findParser(text)?.key).toBe("mda-expensas");
    expect(findParser(fixture("dominijanni-expensas"))?.key).toBe(
      "dominijanni-expensas",
    );
  });

  it("extracts the same fields as a cupón", () => {
    const fields = mdaExpensasParser.parse(text);
    expect(fields.accountNumber).toBe("30-88888888-9:4A");
    expect(fields.totalAmount).toBe(420308.09);
    expect(fields.extraordinaryAmount).toBe(154500);
    expect(fields.dueDate).toBe("2025-12-10");
    expect(fields.period).toBe("2025-12-01"); // "Vencimiento: Dic. 2025"
  });
});

describe("dominijanni expensas (embedded previous receipt)", () => {
  const fields = dominijanniExpensasParser.parse(
    fixture("dominijanni-expensas"),
  );

  it("reads the current aviso, not the embedded April receipt", () => {
    expect(fields.accountNumber).toBe("30-99999999-5:0016");
    expect(fields.totalAmount).toBe(165347.16); // April's was 160,244.16
    expect(fields.dueDate).toBe("2026-06-15");
    // Billed in arrears: the embedded receipt proves período = due month - 1
    // (its "Período: Abril/2026" pairs with "1º vto.: 15/05/2026")
    expect(fields.period).toBe("2026-05-01");
    // April receipt's Cuota Extra ($0.00) must not leak in
    expect(fields.extraordinaryAmount).toBeUndefined();
  });
});

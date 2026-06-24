import { describe, expect, it } from "vitest";
import { ParseError } from "./engine/types";
import {
  addMonths,
  assertAmountsAgree,
  matchOrThrow,
  monthOf,
  parseAmountAR,
  parseAmountUS,
  parseDateDMY,
  parseDateYYMMDD,
  parseSpanishMonth,
} from "./helpers";

describe("parseAmountAR", () => {
  it("parses AR thousands/decimal grouping", () => {
    expect(parseAmountAR("362.675,09")).toBe(362675.09);
  });

  it("strips currency symbols and spaces", () => {
    expect(parseAmountAR("$ 1.646,24")).toBe(1646.24);
  });

  it("reads a trailing minus as negative", () => {
    expect(parseAmountAR("473,74-")).toBe(-473.74);
    expect(parseAmountAR("473,74 -")).toBe(-473.74);
  });

  it("handles whole amounts with no decimals", () => {
    expect(parseAmountAR("1.200")).toBe(1200);
  });

  it("throws when the cleaned value is not a number", () => {
    // Two commas survive cleaning and produce "1.2.3" → NaN.
    expect(() => parseAmountAR("1,2,3")).toThrow(ParseError);
  });
});

describe("parseAmountUS", () => {
  it("parses US thousands/decimal grouping", () => {
    expect(parseAmountUS("22,590.52")).toBe(22590.52);
  });

  it("strips currency symbols and spaces", () => {
    expect(parseAmountUS("$ 1,646.24")).toBe(1646.24);
  });

  it("reads a trailing minus as negative", () => {
    expect(parseAmountUS("473.74-")).toBe(-473.74);
  });

  it("throws when the cleaned value is not a number", () => {
    // Two dots survive cleaning and produce "1.2.3" → NaN.
    expect(() => parseAmountUS("1.2.3")).toThrow(ParseError);
  });
});

describe("parseDateDMY", () => {
  it("converts dd/mm/yyyy to ISO", () => {
    expect(parseDateDMY("18/05/2026")).toBe("2026-05-18");
  });

  it("finds the date embedded in surrounding text", () => {
    expect(parseDateDMY("Vencimiento: 01/12/2026 (pago)")).toBe("2026-12-01");
  });

  it("throws when no date is present", () => {
    expect(() => parseDateDMY("no date here")).toThrow(ParseError);
  });
});

describe("parseDateYYMMDD", () => {
  it("expands YYMMDD into a 20xx ISO date", () => {
    expect(parseDateYYMMDD("260601")).toBe("2026-06-01");
  });

  it("throws on the wrong length", () => {
    expect(() => parseDateYYMMDD("2606")).toThrow(ParseError);
    expect(() => parseDateYYMMDD("20260601")).toThrow(ParseError);
  });
});

describe("monthOf", () => {
  it("snaps an ISO date to the first of its month", () => {
    expect(monthOf("2026-05-18")).toBe("2026-05-01");
  });
});

describe("addMonths", () => {
  it("adds months within a year", () => {
    expect(addMonths("2026-06-01", 1)).toBe("2026-07-01");
  });

  it("subtracts across a year boundary", () => {
    expect(addMonths("2026-01-01", -1)).toBe("2025-12-01");
  });

  it("rolls forward across a year boundary", () => {
    expect(addMonths("2026-11-01", 3)).toBe("2027-02-01");
  });

  it("is a no-op for delta 0", () => {
    expect(addMonths("2026-06-01", 0)).toBe("2026-06-01");
  });
});

describe("assertAmountsAgree", () => {
  it("accepts amounts equal to the cent", () => {
    expect(() => assertAmountsAgree(100.0, 100.004, "ctx")).not.toThrow();
  });

  it("throws when amounts differ beyond rounding", () => {
    expect(() => assertAmountsAgree(100.0, 100.01, "total")).toThrow(
      ParseError,
    );
  });
});

describe("matchOrThrow", () => {
  it("returns the match when found", () => {
    expect(matchOrThrow("abc123", /(\d+)/, "digits")[1]).toBe("123");
  });

  it("throws with the supplied label when not found", () => {
    expect(() => matchOrThrow("abc", /(\d+)/, "digits")).toThrow(
      /Could not find digits/,
    );
  });
});

describe("parseSpanishMonth", () => {
  it("parses an abbreviated month with a trailing dot", () => {
    expect(parseSpanishMonth("Jun.", "2026")).toBe("2026-06-01");
  });

  it("parses a full month name", () => {
    expect(parseSpanishMonth("Junio", "2026")).toBe("2026-06-01");
  });

  it("accepts the 'set' alias for September", () => {
    expect(parseSpanishMonth("set", "2026")).toBe("2026-09-01");
    expect(parseSpanishMonth("sep", "2026")).toBe("2026-09-01");
  });

  it("throws on an unknown month name", () => {
    expect(() => parseSpanishMonth("foo", "2026")).toThrow(ParseError);
  });
});

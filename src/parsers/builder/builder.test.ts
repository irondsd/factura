import { describe, expect, it } from "vitest";
import { runConfig } from "../engine/evaluate";
import type { ParserConfig } from "../engine/types";
import { evaluateConfig } from "./evaluate";
import { generateBody } from "./generate";
import type { Body } from "./generate";
import type { BuilderConfig } from "./model";
import { uid } from "./model";
import { bodyToConfig } from "./parse";

// The Edesur "hard" config expressed in the structured builder model: a
// multi-output barcode, a derive chain (period dialects + the periodMonths
// divisor via constWhen), role fallbacks, and must-agree cross-checks.
const cap = (
  pattern: string,
  flags: string,
  outputs: { name: string; group: string; transforms?: (string | object)[] }[],
) => ({
  id: uid("cap"),
  pattern,
  flags,
  outputs: outputs.map((o) => ({ id: uid("out"), transforms: [], ...o })),
});
const der = (name: string, kind: string, rest: object) => ({
  id: uid("der"),
  name,
  kind,
  ...rest,
});
const role = (primary: string, fallbacks: string[], mustAgree: boolean) => ({
  primary,
  fallbacks,
  mustAgree,
});
const cf = (name: string, source: string, type: string, rest: object = {}) => ({
  id: uid("cf"),
  name,
  source,
  type,
  unit: "",
  includeWhen: "",
  ...rest,
});

const edesur = {
  captures: [
    cap("Cliente:?\\s*(\\d{6,10})", "i", [
      { name: "labelAccount", group: "1", transforms: ["stripLeadingZeros"] },
    ]),
    cap(
      "1° ?\\s*Vencimiento:\\s*(\\d{2}/\\d{2}/\\d{4})\\s*TOTAL:\\s*\\$\\s*([\\d,.]+)",
      "i",
      [
        { name: "labelDue", group: "1", transforms: ["parseDate:DMY"] },
        { name: "labelTotal", group: "2", transforms: ["numberUS"] },
      ],
    ),
    cap(
      "\\b009(?<acct>\\d{10})(?<cents>\\d{11})(?<due>\\d{6})(?<surcharge>\\d{9})\\d{4}\\d{15}\\b",
      "",
      [
        {
          name: "barcode.acct",
          group: "acct",
          transforms: ["stripLeadingZeros"],
        },
        {
          name: "barcode.cents",
          group: "cents",
          transforms: ["centsToAmount"],
        },
        { name: "barcode.due", group: "due", transforms: ["parseDate:YYMMDD"] },
        {
          name: "barcode.surcharge",
          group: "surcharge",
          transforms: ["centsToAmount"],
        },
      ],
    ),
    cap(
      "Periodo liquidado (?<half>1er|2do) tramo del bim\\.?\\s*(?<bim>\\d{1,2})/(?<year>\\d{4})",
      "i",
      [
        {
          name: "tramoHalf",
          group: "half",
          transforms: [{ lookup: { "1er": 1, "2do": 2 } }],
        },
        { name: "tramoBim", group: "bim", transforms: ["toInt"] },
        { name: "tramoYear", group: "year", transforms: ["toInt"] },
      ],
    ),
    cap("Periodo liquidado (\\d{1,2})\\b", "i", [
      { name: "simpleMonth", group: "1", transforms: ["toInt"] },
    ]),
    cap("Energ[ií]a Consumida\\s+([\\d,.]+)\\s*kWh", "i", [
      { name: "kwh", group: "1", transforms: ["numberUS"] },
    ]),
  ],
  derives: [
    der("due", "fallback", { sources: ["barcode.due", "labelDue"] }),
    der("dueYear", "datePart", { dateRef: "due", part: "year" }),
    der("dueMonth", "datePart", { dateRef: "due", part: "month" }),
    der("tramoMonth", "math", { expr: "(tramoBim - 1) * 2 + tramoHalf" }),
    der("tramoPeriod", "dateParts", {
      yearRef: "tramoYear",
      monthRef: "tramoMonth",
      day: 1,
      shift: 0,
    }),
    der("simpleYear", "math", {
      expr: "simpleMonth > dueMonth ? dueYear - 1 : dueYear",
    }),
    der("simplePeriod", "dateParts", {
      yearRef: "simpleYear",
      monthRef: "simpleMonth",
      day: 1,
      shift: 0,
    }),
    der("period", "fallback", { sources: ["tramoPeriod", "simplePeriod"] }),
    der("tramoMonths", "constWhen", { constValue: 2, whenRef: "tramoBim" }),
    der("simpleMonths", "constWhen", { constValue: 1, whenRef: "simpleMonth" }),
    der("periodMonths", "fallback", {
      sources: ["tramoMonths", "simpleMonths"],
    }),
    der("monthlyKwh", "math", { expr: "kwh / periodMonths" }),
  ],
  roles: {
    identity: role("barcode.acct", ["labelAccount"], true),
    amount: role("barcode.cents", ["labelTotal"], true),
    period: role("period", [], false),
    dueDate: role("due", [], false),
  },
  custom: [
    cf("consumption", "monthlyKwh", "quantity", { unit: "kWh" }),
    cf("periodMonths", "periodMonths", "number"),
    cf("lateSurcharge", "barcode.surcharge", "money", {
      includeWhen: "barcode.surcharge > 0",
    }),
  ],
} as unknown as BuilderConfig;

const BARCODE = "0090000123456000022590522504100000452101234123456789012345";
const bimonthly = `EDESUR S.A.
Cliente: 0000123456
Periodo liquidado 1er tramo del bim. 02/2025
Energía Consumida 240 kWh
1° Vencimiento: 10/04/2025    TOTAL: $ 22,590.52
${BARCODE}`;
const monthly = `EDESUR S.A.
Cliente: 0000123456
Periodo liquidado 5
Energía Consumida 132 kWh
1° Vencimiento: 20/05/2025    TOTAL: $ 18,340.00`;

const detect = { allOf: [{ pattern: "edesur", flags: "i" }], noneOf: [] };

describe("structured builder — evaluateConfig", () => {
  it("halves the bimonthly consumption and resolves every role", () => {
    const r = evaluateConfig(bimonthly, edesur);
    expect(r.resolved).toBe(true);
    expect(r.roleOut.amount.value).toBe(22590.52);
    expect(r.roleOut.period.value).toBe("2025-03-01");
    expect(r.values.periodMonths.value).toBe(2);
    expect(r.values.monthlyKwh.value).toBe(120);
    expect(r.custom.find((c) => c.name === "consumption")?.value).toBe(120);
  });

  it("leaves the monthly consumption untouched (no barcode → label fallback)", () => {
    const r = evaluateConfig(monthly, edesur);
    expect(r.values.periodMonths.value).toBe(1);
    expect(r.values.monthlyKwh.value).toBe(132);
    expect(r.roleOut.amount.value).toBe(18340);
    expect(r.roleOut.identity.value).toBe("123456");
  });

  it("flags review when must-agree sources disagree", () => {
    const tampered = bimonthly.replace("22,590.52", "19,999.99");
    const r = evaluateConfig(tampered, edesur);
    expect(r.roleOut.amount.disagree).toBe(true);
    expect(r.issues.some((i) => i.type === "review")).toBe(true);
  });

  it("attaches source spans to captured values for highlighting", () => {
    const r = evaluateConfig(bimonthly, edesur);
    expect(r.values.kwh.spans.length).toBe(1);
    expect(
      bimonthly.slice(r.values.kwh.spans[0].start, r.values.kwh.spans[0].end),
    ).toBe("240");
  });
});

describe("structured builder — generateBody bridges to the real engine", () => {
  it("produces a body runConfig executes identically", () => {
    const body = generateBody(edesur, detect);
    const config = {
      slug: "edesur",
      version: 1,
      vendor: { slug: "edesur", displayName: "Edesur" },
      ...body,
    } as ParserConfig;
    const r = runConfig(config, bimonthly);
    expect(r.amount).toBe(22590.52);
    expect(r.period).toBe("2025-03-01");
    expect(r.custom.consumption).toEqual({ value: 120, unit: "kWh" });
    expect(r.custom.periodMonths).toBe(2);
  });

  it("emits the clean when/use primitive for constWhen (no * 0 trick)", () => {
    const body = generateBody(edesur, detect);
    const step = body.compute?.find((s) => s.name === "tramoMonths");
    expect(step).toEqual({ name: "tramoMonths", when: "tramoBim", use: 2 });
  });
});

describe("structured builder — bodyToConfig reverse map", () => {
  const emptyRoles = {
    identity: { sources: [] },
    amount: { sources: [] },
    period: { sources: [] },
    dueDate: { sources: [] },
  };

  it("round-trips a structured-editor body (generate → parse → generate is stable)", () => {
    const body = generateBody(edesur, detect);
    const back = bodyToConfig(body);
    expect(back).not.toBeNull();
    expect(generateBody(back!, detect)).toEqual(body);
  });

  it("reads when/use and the * 0 + N trick back as constWhen", () => {
    const body = generateBody(edesur, detect);
    expect(
      bodyToConfig(body)!.derives.find((d) => d.name === "tramoMonths"),
    ).toMatchObject({
      kind: "constWhen",
      whenRef: "tramoBim",
      constValue: 2,
    });
    const trick = {
      detect,
      captures: [],
      compute: [{ name: "m", expr: "tramoBim * 0 + 3" }],
      roles: emptyRoles,
    } as unknown as Body;
    expect(bodyToConfig(trick)!.derives[0]).toMatchObject({
      kind: "constWhen",
      whenRef: "tramoBim",
      constValue: 3,
    });
  });

  it("collapses a dateFromParts + addMonths pair into one shifted dateParts", () => {
    const body = {
      detect,
      captures: [],
      compute: [
        { name: "p_parts", dateFromParts: { year: "y", month: "m", day: 1 } },
        { name: "p", addMonths: { date: "p_parts", delta: -1 } },
      ],
      roles: { ...emptyRoles, period: { sources: ["p"] } },
    } as unknown as Body;
    const back = bodyToConfig(body)!;
    expect(back.derives).toHaveLength(1);
    expect(back.derives[0]).toMatchObject({
      name: "p",
      kind: "dateParts",
      yearRef: "y",
      monthRef: "m",
      shift: -1,
    });
    expect(generateBody(back, detect).compute).toEqual(body.compute);
  });

  it("reduces an agree/equals check over a role's two sources to must-agree", () => {
    const body = {
      detect,
      captures: [],
      roles: {
        ...emptyRoles,
        amount: { sources: ["barcode.cents", "labelTotal"] },
      },
      validations: [
        { type: "agree", a: "labelTotal", b: "barcode.cents", label: "Total" },
      ],
    } as unknown as Body;
    expect(bodyToConfig(body)!.roles.amount.mustAgree).toBe(true);
  });

  it("falls back (null) on region, lineContainsAll, standalone addMonths, or an unmatched check", () => {
    const base = { detect, captures: [], roles: emptyRoles };
    expect(
      bodyToConfig({ ...base, region: { before: "x" } } as unknown as Body),
    ).toBeNull();
    expect(
      bodyToConfig({
        ...base,
        compute: [{ name: "x", addMonths: { date: "d", delta: 1 } }],
      } as unknown as Body),
    ).toBeNull();
    expect(
      bodyToConfig({
        ...base,
        validations: [
          { type: "lineContainsAll", linePattern: "x", values: [], label: "l" },
        ],
      } as unknown as Body),
    ).toBeNull();
    expect(
      bodyToConfig({
        ...base,
        validations: [{ type: "equals", a: "a", b: "b", label: "l" }],
      } as unknown as Body),
    ).toBeNull();
  });
});

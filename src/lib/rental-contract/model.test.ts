import { describe, expect, it } from "vitest";
import {
  buildContract,
  contractSchema,
  initialContract,
  isDate,
  type ContractData,
} from "./model";

export function sampleContract(
  type: ContractData["type"] = "vivienda",
): ContractData {
  const person = {
    kind: "persona" as const,
    name: "María López",
    id: "30123456",
    address: "Av. Rivadavia 1234, CABA",
    email: "maria@example.com",
    representative: "",
    authority: "",
  };
  return {
    ...initialContract(type),
    scopeAccepted: true,
    landlords: [person],
    tenants: [
      {
        ...person,
        name: "José Pérez",
        id: "32123456",
        email: "jose@example.com",
      },
    ],
    propertyAddress: "Av. Corrientes 1234, piso 3, unidad B",
    city: "Buenos Aires",
    province: "Ciudad Autónoma de Buenos Aires",
    propertyId: "1234567",
    activity: type === "comercial" ? "Venta minorista de indumentaria" : "",
    signingCity: "Buenos Aires",
    signingDate: "2026-10-10",
    startDate: "2026-11-01",
    endDate: "2028-10-31",
    rent: "850000.50",
    paymentDetails:
      "Transferencia al alias MARIA.ALQUILER, titular María López",
    condition:
      "Paredes recién pintadas, instalaciones en funcionamiento. Una marca en la puerta del dormitorio.",
    jurisdiction: "Ciudad Autónoma de Buenos Aires",
  };
}

describe("rental contracts", () => {
  it("validates deposit and adjustment fields only while those options are active", () => {
    const data = {
      ...sampleContract(),
      depositDays: "123",
      adjustmentMonths: "0",
    };
    expect(contractSchema.safeParse(data).success).toBe(true);
    expect(contractSchema.safeParse({ ...data, deposit: "1" }).success).toBe(
      false,
    );
    expect(
      contractSchema.safeParse({ ...data, adjustment: "IPC" }).success,
    ).toBe(false);
  });
  it("rejects impossible dates, including non-leap February 29", () => {
    expect(isDate("2026-02-29")).toBe(false);
    expect(isDate("2028-02-29")).toBe(true);
    expect(isDate("2026-04-31")).toBe(false);
    expect(isDate("not-a-date")).toBe(false);
  });
  it("requires scope confirmation and complete party identification", () => {
    expect(
      contractSchema.safeParse({ ...sampleContract(), scopeAccepted: false })
        .success,
    ).toBe(false);
    expect(
      contractSchema.safeParse({ ...sampleContract(), tenants: [] }).success,
    ).toBe(false);
    expect(
      contractSchema.safeParse({
        ...sampleContract(),
        tenants: [{ ...sampleContract().tenants[0], email: "invalid" }],
      }).success,
    ).toBe(false);
  });
  it("rejects reversed terms and terms over the statutory maximum", () => {
    expect(
      contractSchema.safeParse({ ...sampleContract(), endDate: "2026-10-31" })
        .success,
    ).toBe(false);
    expect(
      contractSchema.safeParse({ ...sampleContract(), endDate: "2046-10-31" })
        .success,
    ).toBe(true);
    expect(
      contractSchema.safeParse({ ...sampleContract(), endDate: "2046-11-01" })
        .success,
    ).toBe(false);
    expect(
      contractSchema.safeParse({
        ...sampleContract("comercial"),
        endDate: "2076-10-31",
      }).success,
    ).toBe(true);
    expect(
      contractSchema.safeParse({
        ...sampleContract(),
        signingDate: "2026-11-02",
      }).success,
    ).toBe(false);
  });
  it("rejects ambiguous amounts, zero rent, and peso indices for dollars", () => {
    for (const rent of [
      "0",
      "-1",
      "850.000,50",
      "850000,50",
      "1e6",
      "Infinity",
    ]) {
      expect(
        contractSchema.safeParse({ ...sampleContract(), rent }).success,
      ).toBe(false);
    }
    expect(
      contractSchema.safeParse({
        ...sampleContract(),
        currency: "USD",
        adjustment: "IPC",
      }).success,
    ).toBe(false);
    expect(
      contractSchema.safeParse({
        ...sampleContract(),
        currency: "USD",
        adjustment: "ninguno",
        rent: "800",
      }).success,
    ).toBe(true);
  });
  it("requires representatives, furnished inventories and guarantor signatures conditionally", () => {
    const d = sampleContract();
    expect(
      contractSchema.safeParse({
        ...d,
        landlords: [{ ...d.landlords[0], kind: "sociedad" }],
      }).success,
    ).toBe(false);
    expect(contractSchema.safeParse({ ...d, furnished: true }).success).toBe(
      false,
    );
    expect(
      contractSchema.safeParse({ ...d, guarantee: "personal" }).success,
    ).toBe(false);
    const withGuarantor = {
      ...d,
      guarantee: "personal" as const,
      guarantors: [{ ...d.landlords[0], name: "Ana García" }],
    };
    expect(buildContract(withGuarantor).signatures).toHaveLength(3);
    expect(
      buildContract(withGuarantor).sections.some((s) =>
        s.title.includes("Fianza personal"),
      ),
    ).toBe(true);
  });
  it("keeps residential and commercial clauses separate and includes every party", () => {
    const residential = buildContract(sampleContract());
    expect(
      residential.sections.some((s) => s.title.includes("Habilitación")),
    ).toBe(false);
    expect(residential.sections.some((s) => s.title.includes("Fianza"))).toBe(
      false,
    );
    const d = sampleContract("comercial");
    d.landlords.push({ ...d.landlords[0], name: "Ana Gómez" });
    const commercial = buildContract(d);
    expect(commercial.introduction).toContain("Ana Gómez");
    expect(commercial.signatures).toHaveLength(3);
    expect(
      commercial.sections.some((s) => s.title.includes("Habilitación")),
    ).toBe(true);
    expect(commercial.sections.map((s) => s.text).join(" ")).toContain(
      d.activity,
    );
    expect(contractSchema.safeParse({ ...d, activity: "" }).success).toBe(
      false,
    );
    expect(
      residential.sections.find((s) => s.title.includes("Precio y pago"))?.text,
    ).toContain("850.000,50");
  });
});

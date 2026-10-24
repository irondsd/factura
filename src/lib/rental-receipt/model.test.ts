import { describe, expect, it } from "vitest";
import {
  buildBlankReceipt,
  buildReceipt,
  initialReceipt,
  moneyInCents,
  receiptSchema,
  type ReceiptData,
} from "./model";

const sample = (patch: Partial<ReceiptData> = {}): ReceiptData => ({
  ...initialReceipt,
  landlordName: "María López",
  landlordId: "27-12345678-0",
  tenantName: "José Pérez",
  tenantId: "30123456",
  address: "Av. Córdoba 1234, 2.º B, CABA",
  paymentDate: "2026-10-24",
  period: "2026-10",
  amount: "350000,50",
  ...patch,
});

describe("rental receipts", () => {
  it("preserves cents and refuses ambiguous thousands separators", () => {
    expect(moneyInCents("350000,50")).toBe(35000050);
    expect(moneyInCents("350000.05")).toBe(35000005);
    expect(moneyInCents("0,01")).toBe(1);
    for (const amount of [
      "350.000",
      "350,000",
      "1.000,50",
      "-100",
      "1e5",
      "Infinity",
      "",
      "99999999999",
    ]) {
      expect(moneyInCents(amount)).toBeNull();
      expect(receiptSchema.safeParse(sample({ amount })).success).toBe(false);
    }
    expect(receiptSchema.safeParse(sample({ amount: "0" })).success).toBe(
      false,
    );
  });

  it("requires a real payment date and a valid monthly period", () => {
    for (const paymentDate of [
      "2026-02-30",
      "2026-13-01",
      "2026-10-24T00:00:00Z",
      "",
    ]) {
      expect(receiptSchema.safeParse(sample({ paymentDate })).success).toBe(
        false,
      );
    }
    expect(
      receiptSchema.safeParse(sample({ paymentDate: "2024-02-29" })).success,
    ).toBe(true);
    expect(receiptSchema.safeParse(sample({ period: "2026-13" })).success).toBe(
      false,
    );
  });

  it("requires a positive remaining balance for a partial payment", () => {
    expect(receiptSchema.safeParse(sample({ partial: true })).success).toBe(
      false,
    );
    expect(
      receiptSchema.safeParse(sample({ partial: true, balance: "0" })).success,
    ).toBe(false);
    const doc = buildReceipt(
      sample({
        partial: true,
        balance: "10000,25",
        reservations: "Se reservan los intereses de septiembre.",
      }),
    );
    expect(doc.paragraphs.join(" ")).toContain("Pago parcial a cuenta");
    expect(doc.paragraphs.join(" ")).toContain("ARS 10.000,25");
    expect(doc.paragraphs.join(" ")).not.toContain("pago total");
    expect(doc.reservations).toBe("Se reservan los intereses de septiembre.");
  });

  it("requires identification and authority when a representative receives payment", () => {
    expect(
      receiptSchema.safeParse(sample({ collectorRole: "representante" }))
        .success,
    ).toBe(false);
    const doc = buildReceipt(
      sample({
        collectorRole: "representante",
        collectorName: "Ana Gómez",
        collectorId: "20123456",
        authorization: "Autorización escrita del 20/10/2026",
      }),
    );
    expect(doc.signer).toBe("Ana Gómez");
    expect(doc.paragraphs.join(" ")).toContain("en representación del locador");
    expect(doc.paragraphs.join(" ")).toContain("María López");
    expect(doc.paragraphs.join(" ")).toContain(
      "Autorización escrita del 20/10/2026",
    );
  });

  it("does not leak hidden stale representative or balance fields into a full receipt", () => {
    const doc = buildReceipt(
      sample({
        currency: "USD",
        balance: "12345",
        collectorName: "STALE",
        authorization: "STALE",
      }),
    );
    expect(doc.amount).toBe("USD 350.000,50");
    expect(doc.signer).toBe("María López");
    expect(doc.paragraphs.join(" ")).not.toMatch(
      /STALE|12\.345,00|canceladas todas/,
    );
    expect(doc.period).toBe("octubre de 2026");
    expect(doc.date).toBe("24/10/2026");
  });

  it("requires a description of an alternative payment method", () => {
    expect(receiptSchema.safeParse(sample({ method: "otro" })).success).toBe(
      false,
    );
    expect(
      receiptSchema.safeParse(
        sample({ method: "otro", paymentReference: "Cheque 123" }),
      ).success,
    ).toBe(true);
  });

  it("leaves blank documents unselected between total and partial payment", () => {
    expect(buildBlankReceipt().paragraphs.join(" ")).toContain(
      "TOTAL / PARCIAL",
    );
  });
});

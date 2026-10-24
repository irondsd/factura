import { z } from "zod";

export const RECEIPT_PATH = "/recibos/alquiler";
export const RECEIPT_GUIDE = "/guias/como-pagar-y-cobrar-el-alquiler";
export const RECEIPT_VERSION = "2026-10-24";
export const FISCAL_NOTICE =
  "Constancia de pago. No reemplaza el comprobante fiscal de ARCA cuando corresponde emitirlo.";

export const PAYMENT_METHODS = {
  transferencia: "Transferencia",
  deposito: "Depósito bancario",
  efectivo: "Efectivo",
  otro: "Otro medio de pago",
} as const;

/** No thousands separators: 1.000 must never silently become one peso. */
export function moneyInCents(value: string): number | null {
  if (!/^\d{1,10}(?:[.,]\d{1,2})?$/.test(value.trim())) return null;
  const [whole, fraction = ""] = value.trim().split(/[.,]/);
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}

const text = (label: string, max = 120) =>
  z
    .string()
    .trim()
    .min(1, `Completá ${label}.`)
    .max(max, `Usá hasta ${max} caracteres.`);
const optionalText = (max: number) =>
  z.string().trim().max(max, `Usá hasta ${max} caracteres.`);
const money = z
  .string()
  .trim()
  .refine((value) => {
    const cents = moneyInCents(value);
    return cents !== null && cents > 0;
  }, "Ingresá un importe mayor que cero, sin separadores de miles y con hasta dos decimales.");
const date = z.string().refine((value) => {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    value < "1900-01-01" ||
    value > "2099-12-31"
  )
    return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}, "Ingresá una fecha válida.");

export const receiptSchema = z
  .object({
    landlordName: text("el nombre del locador"),
    landlordId: text("el DNI o CUIT del locador", 30),
    tenantName: text("el nombre del inquilino"),
    tenantId: text("el DNI o CUIT del inquilino", 30),
    address: text("la dirección del inmueble", 240),
    paymentDate: date,
    period: z
      .string()
      .regex(
        /^(19|20)\d{2}-(0[1-9]|1[0-2])$/,
        "Elegí el mes y el año del alquiler.",
      ),
    amount: money,
    currency: z.enum(["ARS", "USD"]),
    method: z.enum(["transferencia", "deposito", "efectivo", "otro"]),
    paymentReference: optionalText(160),
    partial: z.boolean(),
    balance: optionalText(30),
    collectorRole: z.enum(["locador", "representante"]),
    collectorName: optionalText(120),
    collectorId: optionalText(30),
    authorization: optionalText(200),
    reference: optionalText(40),
    reservations: optionalText(600),
  })
  .superRefine((data, ctx) => {
    const issue = (path: string, message: string) =>
      ctx.addIssue({ code: "custom", path: [path], message });
    if (data.partial) {
      const balance = moneyInCents(data.balance);
      if (balance === null || balance <= 0)
        issue(
          "balance",
          "Ingresá el saldo pendiente, mayor que cero y sin separadores de miles.",
        );
    }
    if (data.method === "otro" && !data.paymentReference)
      issue("paymentReference", "Indicá qué medio de pago se usó.");
    if (data.collectorRole === "representante") {
      if (!data.collectorName)
        issue("collectorName", "Completá el nombre de quien cobra.");
      if (!data.collectorId)
        issue("collectorId", "Completá el DNI o CUIT de quien cobra.");
      if (!data.authorization)
        issue(
          "authorization",
          "Indicá la autorización para cobrar por el locador.",
        );
    }
  });

export type ReceiptData = z.infer<typeof receiptSchema>;
export const initialReceipt: ReceiptData = {
  landlordName: "",
  landlordId: "",
  tenantName: "",
  tenantId: "",
  address: "",
  paymentDate: "",
  period: "",
  amount: "",
  currency: "ARS",
  method: "transferencia",
  paymentReference: "",
  partial: false,
  balance: "",
  collectorRole: "locador",
  collectorName: "",
  collectorId: "",
  authorization: "",
  reference: "",
  reservations: "",
};

export function formatMoney(
  cents: number,
  currency: ReceiptData["currency"],
): string {
  return `${currency} ${new Intl.NumberFormat("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cents / 100)}`;
}

export type ReceiptDocument = {
  reference: string;
  date: string;
  period: string;
  amount: string;
  paragraphs: string[];
  reservations: string;
  signer: string;
  signerId: string;
};

export function buildReceipt(input: ReceiptData): ReceiptDocument {
  const d = receiptSchema.parse(input);
  const date = new Intl.DateTimeFormat("es-AR", { timeZone: "UTC" }).format(
    new Date(`${d.paymentDate}T12:00:00Z`),
  );
  const period = new Intl.DateTimeFormat("es-AR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${d.period}-01T12:00:00Z`));
  const amount = formatMoney(moneyInCents(d.amount)!, d.currency);
  const represented = d.collectorRole === "representante";
  const signer = represented ? d.collectorName : d.landlordName;
  const signerId = represented ? d.collectorId : d.landlordId;
  return {
    reference: d.reference,
    date,
    period,
    amount,
    signer,
    signerId,
    paragraphs: [
      `Recibí de ${d.tenantName}, DNI / CUIT ${d.tenantId}, la suma de ${amount}, en concepto de alquiler del inmueble ubicado en ${d.address}, correspondiente a ${period}.`,
      `Locador: ${d.landlordName}, DNI / CUIT ${d.landlordId}.${represented ? ` Recibe ${signer}, DNI / CUIT ${signerId}, en representación del locador. Autorización para cobrar: ${d.authorization}.` : ""}`,
      `Medio de pago: ${PAYMENT_METHODS[d.method]}.${d.paymentReference ? ` Referencia o detalle: ${d.paymentReference}.` : ""}`,
      d.partial
        ? `Pago parcial a cuenta del alquiler del período indicado. Saldo pendiente de ese alquiler: ${formatMoney(moneyInCents(d.balance)!, d.currency)}.`
        : "El importe recibido corresponde al pago total del alquiler del período indicado.",
    ],
    reservations: d.reservations,
  };
}

export function buildBlankReceipt(): ReceiptDocument {
  return {
    reference: "________________",
    date: "____ / ____ / ________",
    period: "________________________",
    amount: "________________________",
    paragraphs: [
      "Recibí de __________________________________________________, DNI / CUIT ______________________, la suma de ____________________________ (moneda ____________), en concepto de alquiler del inmueble ubicado en ____________________________________________________________, correspondiente al período ______________________________.",
      "Locador: __________________________________________________, DNI / CUIT ______________________. Si cobra un representante, nombre, DNI / CUIT y autorización: ____________________________________________\n____________________________________________________________.",
      "Medio de pago y referencia: _________________________________\n____________________________________________________________.",
      "El pago es (marcá una opción): TOTAL / PARCIAL. Si es parcial, saldo pendiente del alquiler del período: ____________________.",
    ],
    reservations:
      "____________________________________________________________\n____________________________________________________________\n____________________________________________________________",
    signer: "________________________________________________",
    signerId: "________________________",
  };
}

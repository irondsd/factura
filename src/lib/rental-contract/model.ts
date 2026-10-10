import { z } from "zod";

export const CONTRACT_TYPES = ["vivienda", "comercial"] as const;
export type ContractType = (typeof CONTRACT_TYPES)[number];
export const CONTRACT_VERSION = "2026-10-10.1";
export const CONTRACT_BASE_PATH = "/contratos";
export const contractPath = (type: ContractType) =>
  `${CONTRACT_BASE_PATH}/${type}`;
export const contractGuide = (type: ContractType) =>
  type === "vivienda"
    ? "/guias/modelo-de-contrato-de-alquiler"
    : "/guias/contrato-de-alquiler-de-un-local-comercial";

export const PROVINCES = [
  "Ciudad Autónoma de Buenos Aires",
  "Buenos Aires",
  "Catamarca",
  "Chaco",
  "Chubut",
  "Córdoba",
  "Corrientes",
  "Entre Ríos",
  "Formosa",
  "Jujuy",
  "La Pampa",
  "La Rioja",
  "Mendoza",
  "Misiones",
  "Neuquén",
  "Río Negro",
  "Salta",
  "San Juan",
  "San Luis",
  "Santa Cruz",
  "Santa Fe",
  "Santiago del Estero",
  "Tierra del Fuego, Antártida e Islas del Atlántico Sur",
  "Tucumán",
] as const;

const text = (min = 1, max = 300) =>
  z
    .string()
    .trim()
    .min(min, "Completá este dato.")
    .max(max, `Usá hasta ${max} caracteres.`);
const optionalText = (max = 1000) =>
  z.string().trim().max(max, `Usá hasta ${max} caracteres.`);
const email = z.string().trim().email("Ingresá un correo válido.").max(254);
const date = z.string().refine(isDate, "Ingresá una fecha válida.");
const amount = z
  .string()
  .regex(
    /^\d{1,12}(\.\d{1,2})?$/,
    "Ingresá un importe sin separadores de miles, con hasta dos decimales.",
  );
const integer = (min: number, max: number) =>
  z
    .string()
    .refine(
      (s) => /^\d+$/.test(s) && Number(s) >= min && Number(s) <= max,
      `Ingresá un número entre ${min} y ${max}.`,
    );

export const personSchema = z
  .object({
    kind: z.enum(["persona", "sociedad"]),
    name: text(3, 160),
    id: text(4, 30),
    address: text(8, 300),
    email,
    representative: optionalText(300),
    authority: optionalText(400),
  })
  .superRefine((p, ctx) => {
    if (p.kind === "sociedad") {
      if (p.representative.length < 5)
        ctx.addIssue({
          code: "custom",
          path: ["representative"],
          message: "Indicá nombre y DNI de quien firma.",
        });
      if (p.authority.length < 5)
        ctx.addIssue({
          code: "custom",
          path: ["authority"],
          message:
            "Indicá el cargo y el documento que acredita la representación.",
        });
    }
  });
export type Person = z.infer<typeof personSchema>;
export const emptyPerson = (): Person => ({
  kind: "persona",
  name: "",
  id: "",
  address: "",
  email: "",
  representative: "",
  authority: "",
});

export const contractSchema = z
  .object({
    type: z.enum(CONTRACT_TYPES),
    scopeAccepted: z
      .boolean()
      .refine(Boolean, "Confirmá que el alquiler corresponde a este modelo."),
    landlords: z.array(personSchema).min(1).max(4),
    tenants: z.array(personSchema).min(1).max(4),
    propertyAddress: text(8, 300),
    city: text(2, 100),
    province: z.enum(PROVINCES, { error: "Elegí la provincia del inmueble." }),
    propertyId: text(2, 120),
    activity: optionalText(400),
    occupants: optionalText(600),
    furnished: z.boolean(),
    inventory: optionalText(4000),
    condition: text(10, 4000),
    keys: integer(1, 20),
    meters: optionalText(1000),
    signingCity: text(2, 100),
    signingDate: date,
    startDate: date,
    endDate: date,
    currency: z.enum(["ARS", "USD"]),
    rent: amount.refine(
      (v) => Number(v) > 0,
      "El alquiler debe ser mayor que cero.",
    ),
    paymentDay: integer(1, 28),
    paymentDetails: text(5, 500),
    adjustment: z.enum(["ninguno", "IPC", "ICL"]),
    adjustmentMonths: z.string().trim(),
    deposit: amount,
    depositDays: z.string().trim(),
    services: text(3, 500),
    guarantee: z.enum(["ninguna", "personal"]),
    guarantors: z.array(personSchema).max(4),
    works: optionalText(1500),
    permitRisk: z.enum(["condicionado", "locatario"]),
    insurance: optionalText(500),
    contractCosts: z.enum(["mitades", "locador", "locatario"]),
    jurisdiction: text(3, 200),
  })
  .superRefine((d, ctx) => {
    const issue = (path: string, message: string) =>
      ctx.addIssue({ code: "custom", path: [path], message });
    if (
      d.adjustment !== "ninguno" &&
      !integer(1, 12).safeParse(d.adjustmentMonths).success
    )
      issue("adjustmentMonths", "Ingresá un número entre 1 y 12.");
    if (
      Number(d.deposit) > 0 &&
      !integer(1, 60).safeParse(d.depositDays).success
    )
      issue("depositDays", "Ingresá un número entre 1 y 60.");
    if (isDate(d.startDate) && isDate(d.endDate)) {
      if (d.endDate <= d.startDate)
        issue("endDate", "La finalización debe ser posterior al inicio.");
      const limit = new Date(`${d.startDate}T12:00:00Z`);
      limit.setUTCFullYear(
        limit.getUTCFullYear() + (d.type === "vivienda" ? 20 : 50),
      );
      if (d.endDate >= limit.toISOString().slice(0, 10))
        issue(
          "endDate",
          `El plazo máximo es de ${d.type === "vivienda" ? 20 : 50} años. La fecha final es inclusive.`,
        );
    }
    if (
      isDate(d.signingDate) &&
      isDate(d.startDate) &&
      d.signingDate > d.startDate
    )
      issue(
        "signingDate",
        "Este modelo es para contratos nuevos. La firma debe ser anterior o igual al inicio.",
      );
    if (d.currency === "USD" && d.adjustment !== "ninguno")
      issue(
        "adjustment",
        "Este modelo admite IPC e ICL solo para alquileres en pesos. En dólares, elegí un precio fijo.",
      );
    if (d.type === "comercial" && d.activity.length < 5)
      issue("activity", "Describí la actividad concreta que se desarrollará.");
    if (d.furnished && d.inventory.length < 10)
      issue(
        "inventory",
        "Detallá los muebles y su estado para incluirlos en el inventario.",
      );
    if (d.guarantee === "personal" && !d.guarantors.length)
      issue("guarantors", "Agregá al menos una persona garante.");
    if (d.guarantee === "ninguna" && d.guarantors.length)
      issue(
        "guarantors",
        "Quitá las personas garantes si elegís un contrato sin fianza.",
      );
  });
export type ContractData = z.infer<typeof contractSchema>;

export function isDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value &&
    value >= "2000-01-01" &&
    value <= "2199-12-31"
  );
}

export function initialContract(type: ContractType): ContractData {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return {
    type,
    scopeAccepted: false,
    landlords: [emptyPerson()],
    tenants: [emptyPerson()],
    propertyAddress: "",
    city: "",
    province: "" as ContractData["province"],
    propertyId: "",
    activity: "",
    occupants: "",
    furnished: false,
    inventory: "",
    condition: "",
    keys: "2",
    meters: "",
    signingCity: "",
    signingDate: today,
    startDate: "",
    endDate: "",
    currency: "ARS",
    rent: "",
    paymentDay: "10",
    paymentDetails: "",
    adjustment: "ninguno",
    adjustmentMonths: "3",
    deposit: "0",
    depositDays: "30",
    services: "Electricidad, gas, agua e internet",
    guarantee: "ninguna",
    guarantors: [],
    works: "",
    permitRisk: "condicionado",
    insurance: "",
    contractCosts: "mitades",
    jurisdiction: "",
  };
}

export function formatDate(value: string): string {
  return new Intl.DateTimeFormat("es-AR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00Z`));
}
export const money = (value: string, currency: ContractData["currency"]) =>
  `${currency === "ARS" ? "pesos argentinos (ARS)" : "dólares estadounidenses (USD)"} ${new Intl.NumberFormat("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value))}`;

export type ContractSection = { title: string; text: string };
export type ContractDocument = {
  title: string;
  subtitle: string;
  introduction: string;
  sections: ContractSection[];
  signatures: { role: string; person: Person }[];
};

const describePerson = (p: Person) =>
  `${p.name}, ${p.kind === "sociedad" ? "CUIT" : "DNI / CUIT / identificación"} ${p.id}, con domicilio en ${p.address} y domicilio electrónico en ${p.email}${p.kind === "sociedad" ? `, representada por ${p.representative}, en carácter de ${p.authority}, cuya documentación respaldatoria se acompaña al firmar` : ""}`;

/** The review and PDF use this same document; no clause is generated separately. */
export function buildContract(input: ContractData): ContractDocument {
  const d = contractSchema.parse(input);
  const sections: ContractSection[] = [];
  const add = (title: string, text: string) =>
    sections.push({ title: `${sections.length + 1}. ${title}`, text });
  add(
    "Inmueble y destino",
    `La parte LOCADORA da en locación a la parte LOCATARIA el inmueble ubicado en ${d.propertyAddress}, ${d.city}, ${d.province}, identificado con partida / matrícula / unidad funcional ${d.propertyId}. ${d.type === "vivienda" ? `El destino es exclusivamente vivienda permanente${d.occupants ? `, con las siguientes personas ocupantes: ${d.occupants}` : " de la parte LOCATARIA"}.` : `El destino es exclusivamente el desarrollo de la siguiente actividad: ${d.activity}.`} El destino no podrá modificarse sin acuerdo escrito y cumplimiento de las normas aplicables.`,
  );
  add(
    "Plazo y entrega",
    `La locación comienza el ${formatDate(d.startDate)} y finaliza el ${formatDate(d.endDate)}, inclusive. La entrega de la posesión y de las llaves se realiza en la fecha de inicio, dejando constancia del estado del inmueble en el Anexo I. La renovación requiere acuerdo expreso por escrito.`,
  );
  add(
    "Precio y pago",
    `El alquiler mensual inicial es de ${money(d.rent, d.currency)}. Se paga por adelantado, del día 1 al día ${d.paymentDay} de cada mes, en la moneda pactada. Medio y datos de pago: ${d.paymentDetails}. La parte LOCADORA entrega el recibo o comprobante correspondiente. Si el inicio o la finalización no coinciden con un mes completo, el importe de ese mes se prorratea por los días de vigencia sobre la cantidad de días calendario del mes.`,
  );
  add(
    "Actualización",
    d.adjustment === "ninguno"
      ? "El alquiler se mantiene fijo durante el plazo pactado. Cualquier modificación requiere un nuevo acuerdo escrito de las partes."
      : `El alquiler se actualiza cada ${d.adjustmentMonths} meses desde la fecha de inicio, según el ${d.adjustment === "IPC" ? "Índice de Precios al Consumidor (IPC), nivel general, total nacional, publicado por el INDEC" : "Índice para Contratos de Locación (ICL) publicado por el Banco Central de la República Argentina"}. Para cada ajuste, el alquiler mensual inicial se multiplica por el cociente entre el último valor del índice publicado a la fecha del ajuste y el último valor publicado a la fecha de inicio. Las fechas de ajuste corresponden al mismo día del mes del inicio; si ese día no existe, se usa el último día del mes. La parte LOCADORA comunica el cálculo y los valores utilizados. Si el índice deja de publicarse, se aplica un índice oficial de características similares publicado por el INDEC, conforme al artículo 1199 del Código Civil y Comercial.`,
  );
  add(
    "Depósito",
    Number(d.deposit) === 0
      ? "No se entrega depósito en garantía."
      : `La parte LOCATARIA entrega al firmar ${money(d.deposit, d.currency)} como depósito en garantía, separado del alquiler. Se devuelve por su importe nominal, en la misma moneda, dentro de los ${d.depositDays} días corridos de la restitución del inmueble y entrega de llaves. Solo se deducen daños imputables a la parte LOCATARIA o deudas a su cargo, individualizados y acreditados con comprobantes. El desgaste por uso regular y el transcurso del tiempo no se descuenta.`,
  );
  add(
    "Expensas, impuestos y servicios",
    `La parte LOCATARIA paga las expensas por gastos habituales vinculados a los servicios normales y permanentes a su disposición y los servicios que consume: ${d.services}. La parte LOCADORA paga las expensas extraordinarias ajenas a esos gastos habituales y los impuestos, tasas y contribuciones que gravan el inmueble. Las cargas que se originen en la actividad de la parte LOCATARIA quedan a su cargo. Quien pague una obligación de la otra parte puede reclamar su reintegro contra comprobante.`,
  );
  add(
    "Estado, conservación y reparaciones",
    "La parte LOCADORA entrega el inmueble apto para el destino acordado y realiza a su cargo las reparaciones necesarias por causas no imputables a la parte LOCATARIA. Esta última paga el mero mantenimiento y responde por los daños imputables a ella o a sus visitantes. Se aplican los procedimientos y plazos de reparación de los artículos 1201 y 1207 del Código Civil y Comercial. Las reparaciones se reclaman por medio fehaciente a los domicilios constituidos. El Anexo I integra este contrato.",
  );
  add(
    "Mejoras y obras",
    `Las obras y mejoras requieren autorización previa por escrito de la parte LOCADORA y los permisos que correspondan. ${d.type === "comercial" && d.works ? `Acuerdo particular sobre obras, costos y restitución: ${d.works}. ` : "No se autorizan obras específicas por este contrato. "}El tratamiento de las mejoras necesarias y su eventual retiro se rige por el Código Civil y Comercial y por los acuerdos escritos válidamente celebrados.`,
  );
  if (d.type === "comercial") {
    add(
      "Habilitación y actividad",
      `La parte LOCATARIA tramita las habilitaciones, permisos y autorizaciones necesarios para la actividad. Este contrato no acredita que el inmueble esté habilitado ni que la actividad sea autorizable. ${d.permitRisk === "condicionado" ? "Las partes acuerdan que, si una autoridad deniega la habilitación por una condición del inmueble preexistente a la entrega, no causada por la parte LOCATARIA y acreditada documentalmente, esta puede resolver el contrato sin penalidad, restituir el inmueble y recuperar el depósito y los alquileres anticipados por períodos posteriores a la restitución." : "La parte LOCATARIA declara haber verificado la aptitud administrativa del inmueble para la actividad y asume el trámite y sus costos, sin que ello libere a la parte LOCADORA de sus obligaciones legales ni de responder por información falsa o defectos que le sean imputables."}`,
    );
    add(
      "Seguros",
      d.insurance
        ? `Las partes acuerdan la siguiente cobertura, contratación y responsabilidad por su costo: ${d.insurance}. Las pólizas que correspondan deben mantenerse vigentes durante la actividad.`
        : "Este contrato no impone una cobertura adicional de seguro. Cada parte debe cumplir los seguros obligatorios que resulten de la actividad, la normativa local y el reglamento del inmueble.",
    );
  }
  add(
    "Cesión y sublocación",
    "La parte LOCATARIA no puede ceder su posición contractual ni sublocar el inmueble, total o parcialmente, sin consentimiento previo y escrito de la parte LOCADORA.",
  );
  if (d.guarantee === "personal")
    add(
      "Fianza personal",
      `Intervienen como FIADORES: ${d.guarantors.map(describePerson).join("; ")}. Se constituyen en fiadores solidarios por las obligaciones de pago y restitución de este contrato. La fianza cesa al vencimiento, excepto por la obligación derivada de la falta de restitución en tiempo. Toda renovación o prórroga requiere el consentimiento expreso de los fiadores conforme al artículo 1225 del Código Civil y Comercial. Esta fianza no constituye hipoteca ni certifica solvencia.`,
    );
  add(
    "Resolución e incumplimiento",
    "La parte LOCADORA puede resolver por las causas del artículo 1219 del Código Civil y Comercial. La parte LOCATARIA puede resolver por incumplimientos de la parte LOCADORA en los supuestos legales. Puede también resolver anticipadamente en cualquier momento, notificando fehacientemente y pagando el equivalente al 10 % del saldo del canon locativo futuro desde la fecha de la notificación hasta la fecha de finalización pactada, conforme al artículo 1221. Se mantienen las intimaciones, procedimientos y demás derechos que correspondan por ley.",
  );
  add(
    "Restitución y llaves",
    "Al finalizar, la parte LOCATARIA restituye el inmueble en el estado recibido, salvo el desgaste por uso regular y transcurso del tiempo, y entrega las constancias de pago de las obligaciones a su cargo. Las partes documentan la entrega de llaves y el estado del inmueble en un acta. Las obligaciones pendientes se individualizan sin condicionar la recepción de las llaves.",
  );
  add(
    "Domicilios y notificaciones",
    "Las partes constituyen los domicilios físicos y electrónicos indicados en el encabezado. Todo cambio debe comunicarse por medio fehaciente. Las notificaciones que requieran ese carácter deben permitir acreditar su contenido, envío y recepción; la mera remisión de un correo electrónico no asegura por sí sola esa prueba.",
  );
  add(
    "Gastos y jurisdicción",
    `El impuesto de sellos, si corresponde según la jurisdicción y las exenciones vigentes, y los gastos de certificación de firmas, si se acuerda certificarlas, se distribuyen ${d.contractCosts === "mitades" ? "por mitades entre las partes LOCADORA y LOCATARIA" : `a cargo de la parte ${d.contractCosts === "locador" ? "LOCADORA" : "LOCATARIA"}`}. Este reparto no modifica las obligaciones frente al fisco. Para controversias se acuerdan los tribunales ordinarios competentes de ${d.jurisdiction}, sin desplazar competencias legales improrrogables. Rigen el Código Civil y Comercial y las demás normas aplicables.`,
  );
  sections.push({
    title: "Anexo I. Estado e inventario",
    text: `Estado de entrega: ${d.condition}\n\nMuebles y accesorios: ${d.inventory || "El inmueble se entrega sin muebles ni accesorios adicionales inventariados."}\n\nJuegos de llaves: ${d.keys}.\n\nMedidores y lecturas: ${d.meters || "Las partes dejarán constancia de las lecturas en el acta de entrega."}\n\nLas fotografías y los documentos adicionales que las partes incorporen deben identificarse y firmarse junto con este anexo.`,
  });
  return {
    title:
      d.type === "vivienda"
        ? "Contrato de locación de vivienda"
        : "Contrato de locación comercial",
    subtitle: `${d.city}, ${d.province}`,
    introduction: `En ${d.signingCity}, el ${formatDate(d.signingDate)}, entre ${d.landlords.map(describePerson).join("; ")}, en adelante la parte LOCADORA, y ${d.tenants.map(describePerson).join("; ")}, en adelante la parte LOCATARIA, se celebra el presente contrato, sujeto a las siguientes cláusulas. Las partes manifiestan contar con capacidad y facultades suficientes para celebrarlo.`,
    sections,
    signatures: [
      ...d.landlords.map((person) => ({ role: "Parte locadora", person })),
      ...d.tenants.map((person) => ({ role: "Parte locataria", person })),
      ...(d.guarantee === "personal"
        ? d.guarantors.map((person) => ({ role: "Fiador/a", person }))
        : []),
    ],
  };
}

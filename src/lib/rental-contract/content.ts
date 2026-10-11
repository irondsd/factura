import { contractGuide, type ContractType } from "./model";

// Reader-facing copy for /contratos/*: metadata, the text around the form, the
// field tooltips and the FAQ. Argentine voseo, like the published articles
// (src/content/STYLE.md). Every legal statement cites the article it rests on;
// recheck them against the official texts below when the code changes.
//
// Search intent is split with the guides: these pages answer "pdf / para
// imprimir / gratis", the guides answer "modelo simple" and "nueva ley". Do
// not add those phrases here without moving them off the guides.

export const DNU_70_2023_URL =
  "https://www.argentina.gob.ar/normativa/nacional/decreto-70-2023-395521/texto";
export const CODIGO_CIVIL_URL =
  "https://www.argentina.gob.ar/normativa/nacional/ley-26994-235975/actualizacion";

type Link = { href: string; label: string };
export type FieldInfo = { text: string; link?: Link };
type Faq = { q: string; a: string };

export type ContractPageCopy = {
  title: string;
  description: string;
  keywords: string[];
  eyebrow: string;
  heading: string;
  intro: string;
  /** The neighbouring guide and what it adds that this page does not. */
  guide: Link & { text: string };
  closing: { title: string; text: string };
  faq: Faq[];
};

const priceGuide = (type: ContractType): Link =>
  type === "vivienda"
    ? {
        href: "/guias/como-calcular-el-precio-del-alquiler",
        label: "Cómo calcular el precio de alquiler de un departamento",
      }
    : {
        href: "/guias/calcular-el-alquiler-de-un-local-comercial",
        label: "Cómo calcular el alquiler de un local comercial",
      };

/** What the parties agree freely, shown next to the fields that set it. Each
 * one says the legal rule and then how far this form goes, because the form is
 * narrower than the law (fixed price in USD, IPC/ICL only, personal surety). */
export function fieldInfo(type: ContractType) {
  return {
    term: {
      text:
        type === "vivienda"
          ? "El plazo lo eligen las partes. Si un contrato no lo fija, la ley lo da por hecho a dos años para vivienda permanente, y el máximo es de 20 años (arts. 1197 y 1198 del Código Civil y Comercial). Este modelo pide la fecha de inicio y la de fin, así que el plazo queda escrito."
          : "El plazo lo eligen las partes y la ley no fija un mínimo para un local. Si un contrato no lo dice, se entiende que es de tres años, y el máximo es de 50 (arts. 1197 y 1198 del Código Civil y Comercial). Este modelo pide la fecha de inicio y la de fin, así que el plazo queda escrito.",
    },
    currency: {
      text: "El alquiler puede pactarse en pesos o en moneda extranjera, y quien alquila no puede exigir pagar en otra moneda (art. 1199 del Código Civil y Comercial). Este modelo acepta pesos o dólares. En dólares, el precio queda fijo durante todo el contrato.",
    },
    rent: {
      text: "El precio lo acuerdan las partes, sin tope legal. La ley solo pide que el pago no sea menos frecuente que mensual (art. 1196 del Código Civil y Comercial). Este modelo fija un pago mensual por adelantado.",
      link: priceGuide(type),
    },
    adjustment: {
      text: "Las partes pueden pactar cualquier índice, público o privado, siempre que esté expresado en la misma moneda del alquiler, y la frecuencia de ajuste que quieran (art. 1199 del Código Civil y Comercial). Este modelo ofrece el IPC del INDEC o el ICL del BCRA, solo en pesos, cada 1 a 12 meses.",
      link: {
        href: "/guias/como-calcular-el-aumento-del-alquiler",
        label: "Cómo calcular el aumento del alquiler por IPC o ICL",
      },
    },
    guarantee: {
      text: "El monto y la moneda del depósito son libres, igual que la forma de devolverlo (art. 1196). La fianza personal termina al vencer el contrato, y una renovación necesita que quien sale de fiador vuelva a firmar (art. 1225). Este modelo incluye depósito y fianza personal solidaria. El seguro de caución, la garantía bancaria y la hipoteca van en documentos aparte.",
      link: {
        href: "/guias/garantias-para-alquilar",
        label: "Garantías para alquilar: propietaria, caución y otras",
      },
    },
  } satisfies Record<string, FieldInfo>;
}

const privacyFaq: Faq = {
  q: "¿Factura guarda los datos que cargo en el contrato?",
  a: "No. El formulario funciona en tu navegador: los datos no se envían a Factura ni quedan guardados, y se pierden al recargar la página. El PDF se arma en tu computadora.",
};
const writtenFaq: Faq = {
  q: "¿El contrato de alquiler tiene que ser por escrito?",
  a: "Sí. El Código Civil y Comercial exige que la locación de un inmueble se haga por escrito, y lo mismo vale para sus prórrogas y modificaciones (art. 1188).",
};
const earlyExitFaq: Faq = {
  q: "¿Quien alquila puede irse antes de que termine el contrato?",
  a: "Sí, en cualquier momento, avisando de forma fehaciente y pagando el 10 % del alquiler que faltaba cobrar desde el aviso hasta el final pactado (art. 1221 del Código Civil y Comercial). El modelo incluye esa cláusula.",
};

export const CONTRACT_COPY: Record<ContractType, ContractPageCopy> = {
  vivienda: {
    title: "Contrato de alquiler PDF para imprimir gratis (2026)",
    description:
      "Contrato de alquiler de vivienda en PDF, gratis y sin registro: completalo online o descargá el modelo en blanco para imprimir. Al día con el DNU 70/2023.",
    keywords: [
      "contrato de alquiler pdf",
      "contrato de alquiler para imprimir",
      "contrato de alquiler para imprimir pdf gratis",
      "pdf contrato de alquiler modelo para imprimir argentina",
      "contrato de alquiler argentina",
      "contrato de alquiler de vivienda",
    ],
    eyebrow: "Contratos de alquiler",
    heading: "Contrato de alquiler de vivienda en PDF, listo para imprimir",
    intro:
      "Completá los datos y descargá un contrato de alquiler en PDF, gratis y sin crear una cuenta. Si preferís llenarlo a mano, bajá el modelo en blanco para imprimir. Las cláusulas siguen el Código Civil y Comercial con los cambios del DNU 70/2023.",
    guide: {
      href: contractGuide("vivienda"),
      label: "Modelo de contrato de alquiler simple",
      text: "La guía explica cláusula por cláusula qué debe tener un contrato de vivienda, cómo firmarlo online y qué hacer después de firmar.",
    },
    closing: {
      title: "¿Cuánto cuesta mantener el departamento?",
      text: "Con una cuenta, subís el PDF de cada boleta de luz, gas o agua del departamento y Factura extrae el importe, el período y el consumo. Ves cuánto cuesta mantenerlo mes a mes, en pesos y en dólares.",
    },
    faq: [
      {
        q: "¿Dónde puedo encontrar un modelo de contrato de alquiler en formato PDF?",
        a: "En esta página lo descargás gratis de dos formas: completado con los datos que cargues en el formulario, o en blanco para imprimir y llenar a mano. Las dos versiones tienen las mismas cláusulas, basadas en el Código Civil y Comercial vigente.",
      },
      writtenFaq,
      {
        q: "¿Cuánto dura un contrato de alquiler de vivienda?",
        a: "Lo que acuerden las partes. Si el contrato no fija plazo, se entiende que es de dos años para vivienda permanente, y no puede pasar de 20 años (arts. 1197 y 1198 del Código Civil y Comercial).",
      },
      {
        q: "¿Se puede hacer un contrato de alquiler en dólares?",
        a: "Sí. Desde el DNU 70/2023 el alquiler puede pactarse en pesos o en moneda extranjera, y quien alquila debe pagar en la moneda del contrato (art. 1199). En este modelo, un alquiler en dólares tiene precio fijo.",
      },
      earlyExitFaq,
      privacyFaq,
    ],
  },
  comercial: {
    title: "Contrato de alquiler comercial PDF para imprimir (2026)",
    description:
      "Contrato de alquiler comercial en PDF para un local u oficina: completalo online o descargá el modelo en blanco para imprimir. Gratis y al día con el DNU 70/2023.",
    keywords: [
      "contrato de alquiler comercial pdf",
      "contrato de alquiler local comercial para imprimir pdf",
      "contrato de alquiler comercial para imprimir pdf gratis",
      "contrato de alquiler comercial 2026 argentina",
      "contrato de alquiler comercial modelo",
      "modelo de contrato de alquiler comercial argentina",
      "contrato de alquiler comercial tiempo minimo",
    ],
    eyebrow: "Contratos de alquiler",
    heading: "Contrato de alquiler comercial en PDF, listo para imprimir",
    intro:
      "Completá los datos del local u oficina y descargá el contrato de alquiler comercial en PDF, gratis y sin crear una cuenta. Si preferís llenarlo a mano, bajá el modelo en blanco para imprimir. Las cláusulas siguen el Código Civil y Comercial con los cambios del DNU 70/2023.",
    guide: {
      href: contractGuide("comercial"),
      label: "Cómo hacer un contrato de alquiler de un local comercial",
      text: "La guía repasa las cláusulas de un local una por una: precio, actualización, garantía, expensas, impuestos, reparaciones y rescisión.",
    },
    closing: {
      title: "¿Cuánto cuesta ocupar el local?",
      text: "Con una cuenta, subís las boletas de luz, gas y agua del local y Factura arma la serie de cada servicio, compara períodos y suma el total de cada mes, en pesos y en dólares.",
    },
    faq: [
      {
        q: "¿Cuál es el tiempo mínimo de un contrato de alquiler comercial?",
        a: "La ley vigente no fija un plazo mínimo para un local: vale el que acuerden las partes. Si el contrato no dice nada, se entiende que es de tres años, y no puede pasar de 50 (arts. 1197 y 1198 del Código Civil y Comercial).",
      },
      {
        q: "¿Dónde descargo un modelo de contrato de alquiler comercial en PDF?",
        a: "En esta página, gratis: completado con los datos que cargues en el formulario, o en blanco para imprimir y llenar a mano. Las dos versiones tienen las mismas cláusulas para un local u oficina.",
      },
      {
        q: "¿El contrato asegura que el local se pueda habilitar?",
        a: "No. La habilitación la tramita quien alquila ante el municipio, y el contrato no acredita que el local sea habilitable. El modelo permite pactar que, si una autoridad la rechaza por una condición del inmueble anterior a la entrega, quien alquila pueda resolver el contrato sin penalidad.",
      },
      {
        q: "¿Se puede alquilar un local en dólares?",
        a: "Sí. El alquiler puede pactarse en pesos o en moneda extranjera, y quien alquila debe pagar en la moneda del contrato (art. 1199 del Código Civil y Comercial). En este modelo, un alquiler en dólares tiene precio fijo.",
      },
      earlyExitFaq,
      privacyFaq,
    ],
  },
};

/** The clauses both documents carry, in the order the PDF prints them. */
export function clauseList(type: ContractType): string[] {
  return [
    type === "vivienda"
      ? "Inmueble y destino de vivienda permanente"
      : "Inmueble y actividad del local",
    "Plazo y entrega de llaves",
    "Precio, forma de pago y actualización",
    "Depósito en garantía y fianza personal",
    "Expensas, impuestos y servicios",
    "Reparaciones, mejoras y obras",
    ...(type === "comercial" ? ["Habilitación y seguros"] : []),
    "Cesión, sublocación y resolución anticipada",
    "Restitución, domicilios, sellos y jurisdicción",
    "Anexo I con el estado del inmueble y el inventario",
  ];
}

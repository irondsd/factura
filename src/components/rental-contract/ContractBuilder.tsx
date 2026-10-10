"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  buildContract,
  contractGuide,
  contractPath,
  contractSchema,
  emptyPerson,
  initialContract,
  PROVINCES,
  type ContractData,
  type ContractType,
  type Person,
} from "@/lib/rental-contract/model";
import styles from "./contract.module.css";

const steps = [
  "Partes",
  "Inmueble",
  "Plazo y precio",
  "Gastos y garantía",
  "Revisión y PDF",
];
const groups = [
  ["scopeAccepted", "landlords", "tenants"],
  [
    "propertyAddress",
    "city",
    "province",
    "propertyId",
    "activity",
    "occupants",
    "furnished",
    "inventory",
    "condition",
    "keys",
    "meters",
  ],
  [
    "signingCity",
    "signingDate",
    "startDate",
    "endDate",
    "currency",
    "rent",
    "paymentDay",
    "paymentDetails",
    "adjustment",
    "adjustmentMonths",
  ],
  [
    "deposit",
    "depositDays",
    "services",
    "guarantee",
    "guarantors",
    "works",
    "permitRisk",
    "insurance",
    "contractCosts",
    "jurisdiction",
  ],
];
type FieldOptions = {
  type?: string;
  hint?: string;
  optional?: boolean;
  multiline?: boolean;
  options?: readonly (string | readonly [string, string])[];
  max?: number;
};
const primary =
  "inline-flex items-center justify-center gap-2 bg-accent px-5 py-3 font-mono text-[13px] text-white transition-colors hover:bg-ink disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent";
const secondary =
  "inline-flex items-center justify-center border border-line bg-card px-5 py-3 font-mono text-[13px] text-ink transition-colors hover:border-ink focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent";

export function ContractBuilder({ type }: { type: ContractType }) {
  const [data, setData] = useState(() => initialContract(type));
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [reviewed, setReviewed] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [failure, setFailure] = useState("");
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const moved = useRef(false);
  useEffect(
    () => () => {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    },
    [pdfUrl],
  );
  useEffect(() => {
    if (moved.current) heading.current?.focus();
    moved.current = true;
  }, [step]);

  function update<K extends keyof ContractData>(
    key: K,
    value: ContractData[K],
  ) {
    setData((previous) => ({ ...previous, [key]: value }));
    setPdfUrl(null);
    setReviewed(false);
    setFailure("");
    setErrors((previous) =>
      Object.fromEntries(
        Object.entries(previous).filter(
          ([path]) => path !== key && !path.startsWith(`${key}.`),
        ),
      ),
    );
  }

  function field(
    key: keyof ContractData,
    label: string,
    options: FieldOptions = {},
  ) {
    const {
      type: inputType = "text",
      hint,
      optional,
      multiline,
      options: choices,
      max = 300,
    } = options;
    const error = errors[key];
    const props = {
      id: key,
      name: key,
      value: String(data[key]),
      "aria-invalid": Boolean(error),
      "aria-describedby": hint || error ? `${key}-help` : undefined,
      onChange: (
        e: React.ChangeEvent<
          HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
        >,
      ) => {
        // Both current adjustment choices are denominated in pesos.
        if (key === "currency" && e.target.value === "USD")
          update("adjustment", "ninguno");
        update(key, e.target.value as never);
      },
      className: styles.input,
      required: !optional,
    };
    return (
      <div className={styles.field} key={key}>
        <label htmlFor={key}>
          {label}
          {optional && <span className={styles.optional}> (opcional)</span>}
        </label>
        {choices ? (
          <select {...props}>
            {choices.map((choice) => {
              const [value, title] =
                typeof choice === "string" ? [choice, choice] : choice;
              return (
                <option key={value} value={value}>
                  {title}
                </option>
              );
            })}
          </select>
        ) : multiline ? (
          <textarea {...props} rows={4} maxLength={max} />
        ) : (
          <input
            {...props}
            type={inputType}
            maxLength={max}
            step={inputType === "number" ? "0.01" : undefined}
            autoComplete="off"
          />
        )}
        {(hint || error) && (
          <p id={`${key}-help`} className={error ? styles.error : styles.hint}>
            {error || hint}
          </p>
        )}
      </div>
    );
  }

  function people(
    key: "landlords" | "tenants" | "guarantors",
    title: string,
    singular: string,
  ) {
    function change(index: number, property: keyof Person, value: string) {
      update(
        key,
        data[key].map((person, i) =>
          i === index ? { ...person, [property]: value } : person,
        ),
      );
    }
    return (
      <fieldset className={styles.people}>
        <legend>{title}</legend>
        {data[key].map((person, index) => (
          <div className={styles.person} key={index}>
            <div className={styles.personTitle}>
              <span>
                {singular} {index + 1}
              </span>
              {data[key].length > 1 && (
                <button
                  type="button"
                  className={styles.textButton}
                  onClick={() =>
                    update(
                      key,
                      data[key].filter((_, i) => i !== index),
                    )
                  }
                >
                  Quitar {singular.toLowerCase()} {index + 1}
                </button>
              )}
            </div>
            <div className={styles.fields}>
              {(key === "guarantors"
                ? ["name", "id", "address", "email"]
                : [
                    "kind",
                    "name",
                    "id",
                    "address",
                    "email",
                    ...(person.kind === "sociedad"
                      ? ["representative", "authority"]
                      : []),
                  ]
              ).map((property) => {
                const p = property as keyof Person;
                const id = `${key}.${index}.${p}`;
                const labels = {
                  kind: "Tipo de persona",
                  name:
                    person.kind === "sociedad"
                      ? "Razón social"
                      : "Nombre y apellido",
                  id:
                    person.kind === "sociedad"
                      ? "CUIT"
                      : "DNI, CUIT o identificación",
                  address: "Domicilio completo",
                  email: "Correo para notificaciones",
                  representative: "Nombre y DNI del representante",
                  authority: "Cargo y documento que acredita sus facultades",
                };
                const input = {
                  id,
                  name: id,
                  value: person[p],
                  className: styles.input,
                  "aria-invalid": Boolean(errors[id]),
                  "aria-describedby": errors[id] ? `${id}-help` : undefined,
                  onChange: (
                    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
                  ) => change(index, p, e.target.value),
                };
                return (
                  <div key={p} className={styles.field}>
                    <label htmlFor={id}>{labels[p]}</label>
                    {p === "kind" ? (
                      <select {...input}>
                        <option value="persona">Persona humana</option>
                        <option value="sociedad">
                          Sociedad / persona jurídica
                        </option>
                      </select>
                    ) : (
                      <input
                        {...input}
                        type={p === "email" ? "email" : "text"}
                        maxLength={
                          p === "name"
                            ? 160
                            : p === "id"
                              ? 30
                              : p === "email"
                                ? 254
                                : p === "authority"
                                  ? 400
                                  : 300
                        }
                        autoComplete="off"
                        required
                      />
                    )}
                    {errors[id] && (
                      <p id={`${id}-help`} className={styles.error}>
                        {errors[id]}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        {errors[key] && <p className={styles.error}>{errors[key]}</p>}
        {data[key].length < 4 && (
          <button
            type="button"
            className={styles.textButton}
            onClick={() => update(key, [...data[key], emptyPerson()])}
          >
            + Agregar {singular.toLowerCase()}
          </button>
        )}
      </fieldset>
    );
  }

  function next() {
    const result = contractSchema.safeParse(data);
    if (!result.success) {
      const all = Object.fromEntries(
        result.error.issues.map((issue) => [
          issue.path.join("."),
          issue.message,
        ]),
      );
      const relevant = Object.fromEntries(
        Object.entries(all).filter(([path]) =>
          groups[step]?.includes(path.split(".")[0]),
        ),
      );
      if (Object.keys(relevant).length) {
        setErrors(relevant);
        window.document.getElementById(Object.keys(relevant)[0])?.focus();
        return;
      }
      if (step === 3) {
        setErrors(all);
        const first = Object.keys(all)[0].split(".")[0];
        setStep(
          Math.max(
            0,
            groups.findIndex((group) => group.includes(first)),
          ),
        );
        return;
      }
    }
    setErrors({});
    setStep(step + 1);
  }

  async function generate() {
    setGenerating(true);
    setFailure("");
    try {
      const { generateContractPdf } = await import("@/lib/rental-contract/pdf");
      const bytes = await generateContractPdf(data);
      setPdfUrl(
        URL.createObjectURL(new Blob([bytes], { type: "application/pdf" })),
      );
    } catch (error) {
      setFailure(
        error instanceof Error
          ? error.message
          : "No pudimos generar el PDF. Volvé a intentarlo.",
      );
    } finally {
      setGenerating(false);
    }
  }

  const document = step === 4 ? buildContract(data) : null;
  return (
    <div className={`${styles.builder} ph-no-capture ph-mask`} data-private>
      <nav aria-label="Tipo de contrato" className={styles.typeNav}>
        <Link
          href={contractPath("vivienda")}
          aria-current={type === "vivienda" ? "page" : undefined}
        >
          Vivienda permanente
        </Link>
        <Link
          href={contractPath("comercial")}
          aria-current={type === "comercial" ? "page" : undefined}
        >
          Local comercial
        </Link>
      </nav>
      <div className={styles.workspace}>
        <aside className={styles.sidebar}>
          <ol className={styles.steps} aria-label="Pasos del formulario">
            {steps.map((label, index) => (
              <li
                key={label}
                aria-current={step === index ? "step" : undefined}
              >
                <button
                  type="button"
                  disabled={index >= step || generating}
                  onClick={() => {
                    setStep(index);
                    setErrors({});
                  }}
                >
                  <span>{index < step ? "✓" : index + 1}</span>
                  {label}
                </button>
              </li>
            ))}
          </ol>
          <p className={styles.privacy}>
            Tus datos quedan en este navegador. No los guardamos ni los enviamos
            a nuestros servidores. Al salir o recargar, se pierden.
          </p>
          <Link
            href={contractGuide(type)}
            className={styles.guideLink}
            target="_blank"
            rel="noopener"
          >
            Leer la guía del contrato <span aria-hidden>↗</span>
          </Link>
        </aside>
        <div className={styles.panel}>
          <div className={styles.stepHeader}>
            <p>
              Paso {step + 1} de {steps.length}
            </p>
            <h2 ref={heading} tabIndex={-1}>
              {steps[step]}
            </h2>
          </div>
          {Object.keys(errors).length > 0 && (
            <p role="alert" className={styles.errorSummary}>
              Revisá los datos señalados antes de continuar.
            </p>
          )}
          <form
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              if (step < 4) next();
            }}
          >
            {step === 0 && (
              <>
                <div className={styles.notice}>
                  <p>
                    Este modelo es para un contrato nuevo de{" "}
                    {type === "vivienda"
                      ? "vivienda permanente"
                      : "locación de un local u oficina"}{" "}
                    en Argentina.
                  </p>
                  <p>
                    Excluye alquileres temporarios, habitaciones, sublocaciones,
                    uso mixto, arrendamientos rurales y operaciones especiales.
                    Antes de firmar, revisá el documento con un profesional.
                  </p>
                  <label className={styles.checkbox}>
                    <input
                      id="scopeAccepted"
                      type="checkbox"
                      checked={data.scopeAccepted}
                      onChange={(e) =>
                        update("scopeAccepted", e.target.checked)
                      }
                      aria-invalid={Boolean(errors.scopeAccepted)}
                      aria-describedby={
                        errors.scopeAccepted ? "scopeAccepted-help" : undefined
                      }
                    />
                    Mi alquiler corresponde a este destino y a este alcance.
                  </label>
                  {errors.scopeAccepted && (
                    <p id="scopeAccepted-help" className={styles.error}>
                      {errors.scopeAccepted}
                    </p>
                  )}
                </div>
                {people(
                  "landlords",
                  "Quién da el inmueble en alquiler",
                  "Locador/a",
                )}
                {people("tenants", "Quién alquila el inmueble", "Locatario/a")}
              </>
            )}
            {step === 1 && (
              <>
                <div className={styles.fields}>
                  {field("propertyAddress", "Dirección, piso y unidad")}
                  {field(
                    "propertyId",
                    "Partida, matrícula o unidad funcional",
                    {
                      hint: "Copiá la identificación del título o de la boleta inmobiliaria.",
                      max: 120,
                    },
                  )}
                  {field("city", "Localidad", { max: 100 })}
                  {field("province", "Provincia", {
                    options: [["", "Elegí una provincia"], ...PROVINCES],
                  })}
                </div>
                {type === "comercial"
                  ? field("activity", "Actividad concreta del local", {
                      multiline: true,
                      hint: "Por ejemplo: venta minorista de indumentaria. Verificá que la actividad pueda habilitarse.",
                      max: 400,
                    })
                  : field(
                      "occupants",
                      "Otras personas que van a vivir en el inmueble",
                      {
                        optional: true,
                        multiline: true,
                        hint: "Nombre y apellido. Incluí solo los datos necesarios.",
                        max: 600,
                      },
                    )}
                <label className={styles.checkbox}>
                  <input
                    type="checkbox"
                    checked={data.furnished}
                    onChange={(e) => update("furnished", e.target.checked)}
                  />
                  Se entrega amueblado
                </label>
                {field("inventory", "Inventario de muebles y accesorios", {
                  optional: !data.furnished,
                  multiline: true,
                  hint: "Detallá cada elemento y su estado. Se incorpora al Anexo I.",
                  max: 4000,
                })}
                {field("condition", "Estado del inmueble al entregarlo", {
                  multiline: true,
                  hint: "Describí ambientes, instalaciones y desperfectos existentes.",
                  max: 4000,
                })}
                <div className={styles.fields}>
                  {field("keys", "Cantidad de juegos de llaves", {
                    type: "number",
                  })}
                  {field("meters", "Medidores y lecturas", {
                    optional: true,
                    multiline: true,
                    max: 1000,
                  })}
                </div>
              </>
            )}
            {step === 2 && (
              <>
                <div className={styles.fields}>
                  {field("signingCity", "Localidad de firma", { max: 100 })}
                  {field("signingDate", "Fecha de firma", { type: "date" })}
                  {field("startDate", "Inicio del alquiler", { type: "date" })}
                  {field("endDate", "Último día del alquiler (inclusive)", {
                    type: "date",
                  })}
                  {field("currency", "Moneda de pago", {
                    options: [
                      ["ARS", "Pesos argentinos (ARS)"],
                      ["USD", "Dólares estadounidenses (USD)"],
                    ],
                  })}
                  {field("rent", "Alquiler mensual inicial", {
                    type: "number",
                    hint: "Sin separadores de miles. Podés ingresar centavos.",
                  })}
                  {field("paymentDay", "Día límite de pago de cada mes", {
                    type: "number",
                    hint: "Del 1 al 28. El período de pago empieza el día 1.",
                  })}
                  {field("adjustment", "Actualización del alquiler", {
                    options:
                      data.currency === "ARS"
                        ? [
                            ["ninguno", "Precio fijo"],
                            ["IPC", "IPC nacional (INDEC)"],
                            ["ICL", "ICL (BCRA)"],
                          ]
                        : [["ninguno", "Precio fijo en dólares"]],
                    hint: "En dólares, este modelo admite precio fijo.",
                  })}
                  {data.adjustment !== "ninguno" &&
                    field("adjustmentMonths", "Meses entre actualizaciones", {
                      type: "number",
                      hint: "Entre 1 y 12 meses. El PDF explica la fórmula.",
                    })}
                </div>
                {field("paymentDetails", "Medio y datos para el pago", {
                  multiline: true,
                  hint: "Por ejemplo: transferencia al CBU o alias y titular de la cuenta.",
                  max: 500,
                })}
              </>
            )}
            {step === 3 && (
              <>
                <div className={styles.notice}>
                  <p>
                    El modelo asigna al locador los impuestos que gravan el
                    inmueble y las expensas extraordinarias. El locatario paga
                    gastos habituales, servicios consumidos y cargas de su
                    actividad.
                  </p>
                </div>
                <div className={styles.fields}>
                  {field("deposit", `Depósito en ${data.currency}`, {
                    type: "number",
                    hint: "Ingresá 0 si no se pacta depósito.",
                  })}
                  {Number(data.deposit) > 0 &&
                    field(
                      "depositDays",
                      "Días corridos para devolver el depósito",
                      {
                        type: "number",
                        hint: "Se devuelve por el monto nominal, en la misma moneda, con deducciones documentadas.",
                      },
                    )}
                </div>
                {field("services", "Servicios a cargo del locatario", {
                  multiline: true,
                  max: 500,
                })}
                <div className={styles.field}>
                  <label htmlFor="guarantee">
                    Garantía adicional al depósito
                  </label>
                  <select
                    id="guarantee"
                    className={styles.input}
                    value={data.guarantee}
                    onChange={(e) => {
                      const value = e.target.value as ContractData["guarantee"];
                      update("guarantee", value);
                      update(
                        "guarantors",
                        value === "personal" ? [emptyPerson()] : [],
                      );
                    }}
                  >
                    <option value="ninguna">Sin fianza personal</option>
                    <option value="personal">Fianza personal solidaria</option>
                  </select>
                  <p className={styles.hint}>
                    Los seguros de caución, garantías bancarias e hipotecas
                    requieren documentación específica y quedan fuera de este
                    modelo.
                  </p>
                </div>
                {data.guarantee === "personal" &&
                  people(
                    "guarantors",
                    "Personas que firman como fiadoras",
                    "Fiador/a",
                  )}
                {type === "comercial" && (
                  <>
                    {field("permitRisk", "Si no se obtiene la habilitación", {
                      options: [
                        [
                          "condicionado",
                          "Permitir resolver por impedimentos preexistentes del inmueble",
                        ],
                        [
                          "locatario",
                          "El locatario verificó la aptitud y asume el trámite",
                        ],
                      ],
                      hint: "Leé la cláusula completa en la revisión. El contrato no certifica que el local sea habilitable.",
                    })}
                    {field(
                      "works",
                      "Obras autorizadas y condiciones de devolución",
                      {
                        optional: true,
                        multiline: true,
                        hint: "Especificá quién paga y qué se retira o queda en el local. Sin completar, no se autorizan obras específicas.",
                        max: 1500,
                      },
                    )}
                    {field("insurance", "Seguro acordado y quién lo paga", {
                      optional: true,
                      multiline: true,
                      hint: "Los seguros obligatorios de la actividad se mantienen aunque no completes este campo.",
                      max: 500,
                    })}
                  </>
                )}
                {field(
                  "contractCosts",
                  "Sellos y certificación de firmas, si corresponden",
                  {
                    options: [
                      ["mitades", "Ambas partes por mitades"],
                      ["locador", "A cargo del locador"],
                      ["locatario", "A cargo del locatario"],
                    ],
                    hint: "La obligación tributaria y las exenciones dependen de la jurisdicción.",
                  },
                )}
                {field(
                  "jurisdiction",
                  "Jurisdicción de los tribunales competentes",
                  {
                    hint: "Indicá la localidad o el departamento judicial. Confirmá la competencia aplicable con un profesional.",
                    max: 200,
                  },
                )}
              </>
            )}
            {step === 4 && document && (
              <>
                <div className={styles.notice}>
                  <p>
                    Revisá todos los datos y cláusulas. El PDF se descarga sin
                    firmas y requiere el acuerdo de las partes. Factura.uno
                    facilita su generación; no interviene como parte ni garante
                    y no certifica su validez para tu caso.
                  </p>
                </div>
                <details className={styles.review} open>
                  <summary>Leer el contrato completo</summary>
                  <article
                    className={styles.document}
                    aria-label="Contrato para revisar"
                  >
                    <h3>{document.title}</h3>
                    <p>{document.introduction}</p>
                    {document.sections.map((section) => (
                      <section key={section.title}>
                        <h4>{section.title}</h4>
                        <p>{section.text}</p>
                      </section>
                    ))}
                    <h4>Firmas de las partes</h4>
                    {document.signatures.map(({ role, person }, index) => (
                      <p key={index}>
                        {role}: {person.name}, {person.id}
                      </p>
                    ))}
                  </article>
                </details>
                {!pdfUrl && (
                  <>
                    <label className={styles.checkbox}>
                      <input
                        type="checkbox"
                        checked={reviewed}
                        onChange={(e) => setReviewed(e.target.checked)}
                        disabled={generating}
                      />
                      Revisé los datos y entiendo que el documento debe ser
                      acordado y firmado por las partes.
                    </label>
                    <button
                      type="button"
                      className={primary}
                      disabled={!reviewed || generating}
                      onClick={generate}
                    >
                      {generating ? "Generando PDF…" : "Generar PDF"}
                    </button>
                    {generating && (
                      <p role="status" className={styles.hint}>
                        Estamos preparando el documento con las fuentes y la
                        identidad de Factura.uno.
                      </p>
                    )}
                  </>
                )}
                {failure && (
                  <p role="alert" className={styles.error}>
                    {failure}
                  </p>
                )}
                {pdfUrl && (
                  <div className={styles.download}>
                    <p role="status">Tu PDF está listo.</p>
                    <a
                      href={pdfUrl}
                      download={`contrato-alquiler-${type}-${data.startDate}.pdf`}
                      className={primary}
                    >
                      Descargar PDF
                    </a>
                    <a
                      href={pdfUrl}
                      target="_blank"
                      rel="noopener"
                      className={styles.textButton}
                    >
                      Abrir PDF en otra pestaña
                    </a>
                    <p className={styles.hint}>
                      Incluye el contrato, el inventario y los espacios para
                      firmas. Si cambiás los datos, generá un nuevo PDF.
                    </p>
                    <iframe
                      src={pdfUrl}
                      title="Vista previa del PDF generado"
                      className={styles.pdfPreview}
                    />
                  </div>
                )}
              </>
            )}
            <div className={styles.actions}>
              {step > 0 && (
                <button
                  type="button"
                  className={secondary}
                  disabled={generating}
                  onClick={() => {
                    setStep(step - 1);
                    setErrors({});
                  }}
                >
                  Volver
                </button>
              )}
              {step < 4 && (
                <button type="submit" className={primary}>
                  {step === 3 ? "Revisar contrato" : "Continuar"}
                </button>
              )}
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

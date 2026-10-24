"use client";

import { useEffect, useRef, useState } from "react";
import {
  buildReceipt,
  initialReceipt,
  PAYMENT_METHODS,
  receiptSchema,
  type ReceiptData,
} from "@/lib/rental-receipt/model";
import { receiptEvent } from "./analytics";
import { ReceiptDocument } from "./ReceiptDocument";
import { BlankReceiptPreview } from "./BlankReceiptPreview";
import styles from "./receipt.module.css";

export function ReceiptBuilder() {
  const [data, setData] = useState<ReceiptData>(initialReceipt);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [review, setReview] = useState<ReceiptData | null>(null);
  const [generating, setGenerating] = useState(false);
  const [failure, setFailure] = useState("");
  const [url, setUrl] = useState<string | null>(null);
  const [downloaded, setDownloaded] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const errorSummary = useRef<HTMLDivElement>(null);
  const reviewHeading = useRef<HTMLHeadingElement>(null);
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );
  useEffect(() => {
    if (review) reviewHeading.current?.focus();
  }, [review]);

  function update<K extends keyof ReceiptData>(key: K, value: ReceiptData[K]) {
    setData((previous) => ({ ...previous, [key]: value }));
    setUrl(null);
    setFailure("");
    setDownloaded(false);
    setErrors((previous) => {
      const next = { ...previous };
      delete next[key];
      return next;
    });
  }

  function field(
    key: keyof ReceiptData,
    label: string,
    options: {
      type?: string;
      hint?: string;
      optional?: boolean;
      max?: number;
      money?: boolean;
    } = {},
  ) {
    const {
      type = "text",
      hint,
      optional = false,
      max = 120,
      money = false,
    } = options;
    const describedBy =
      [hint ? `${key}-hint` : "", errors[key] ? `${key}-error` : ""]
        .filter(Boolean)
        .join(" ") || undefined;
    return (
      <div className={styles.field} key={key}>
        <label htmlFor={`receipt-${key}`}>
          {label}
          {optional && <span> (opcional)</span>}
        </label>
        <input
          id={`receipt-${key}`}
          name={key}
          type={type}
          value={String(data[key])}
          onChange={(e) => update(key, e.target.value as never)}
          required={!optional}
          maxLength={max}
          inputMode={money ? "decimal" : undefined}
          autoComplete="off"
          min={
            type === "date"
              ? "1900-01-01"
              : type === "month"
                ? "1900-01"
                : undefined
          }
          max={
            type === "date"
              ? "2099-12-31"
              : type === "month"
                ? "2099-12"
                : undefined
          }
          aria-invalid={!!errors[key]}
          aria-describedby={describedBy}
        />
        {hint && (
          <p id={`${key}-hint`} className={styles.hint}>
            {hint}
          </p>
        )}
        {errors[key] && (
          <p id={`${key}-error`} className={styles.error}>
            {errors[key]}
          </p>
        )}
      </div>
    );
  }

  function select<K extends "currency" | "method" | "collectorRole">(
    key: K,
    label: string,
    choices: Record<string, string>,
  ) {
    return (
      <div className={styles.field}>
        <label htmlFor={`receipt-${key}`}>{label}</label>
        <select
          id={`receipt-${key}`}
          name={key}
          value={data[key]}
          onChange={(e) => update(key, e.target.value as ReceiptData[K])}
        >
          {Object.entries(choices).map(([value, text]) => (
            <option key={value} value={value}>
              {text}
            </option>
          ))}
        </select>
      </div>
    );
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const result = receiptSchema.safeParse(data);
    if (!result.success) {
      setErrors(
        Object.fromEntries(
          result.error.issues.map((issue) => [issue.path[0], issue.message]),
        ),
      );
      requestAnimationFrame(() => errorSummary.current?.focus());
      return;
    }
    setErrors({});
    setReview(result.data);
    receiptEvent("reviewed");
  }

  async function download() {
    if (!review || generating) return;
    setGenerating(true);
    setFailure("");
    try {
      let href = url;
      if (!href) {
        const { generateReceiptPdf } = await import("@/lib/rental-receipt/pdf");
        href = URL.createObjectURL(
          new Blob([await generateReceiptPdf(review)], {
            type: "application/pdf",
          }),
        );
        setUrl(href);
      }
      const link = document.createElement("a");
      link.href = href;
      link.download = `recibo-alquiler-${review.period}.pdf`;
      link.click();
      setDownloaded(true);
      receiptEvent("pdf_downloaded");
    } catch (error) {
      setFailure(
        error instanceof Error
          ? error.message
          : "No pudimos generar el PDF. Volvé a intentarlo.",
      );
      receiptEvent("pdf_failed");
    } finally {
      setGenerating(false);
    }
  }

  function edit() {
    setReview(null);
    setFailure("");
    requestAnimationFrame(() =>
      form.current?.querySelector<HTMLInputElement>("input")?.focus(),
    );
  }

  return (
    <section
      id="completar"
      className={`${styles.builder} ph-no-capture ph-mask`}
      data-private
      aria-label="Crear un recibo de alquiler"
    >
      {review ? (
        <div className={styles.review}>
          <h2 ref={reviewHeading} tabIndex={-1}>
            Revisá el recibo antes de descargarlo
          </h2>
          <p>
            Confirmá el período, el importe recibido y las reservas. El PDF
            queda pendiente de la firma de quien cobró.
          </p>
          <div className={styles.actions}>
            <button
              type="button"
              onClick={download}
              disabled={generating}
              className={styles.primary}
            >
              {generating ? "Preparando el PDF…" : "Descargar recibo en PDF"}
            </button>
            <button
              type="button"
              onClick={edit}
              disabled={generating}
              className={styles.secondary}
            >
              Editar datos
            </button>
          </div>
          {failure && (
            <p role="alert" className={styles.error}>
              {failure}
            </p>
          )}
          {downloaded && (
            <p role="status" className={styles.hint}>
              El PDF está listo. Guardá una copia y pedí la firma de quien
              recibió el pago.
            </p>
          )}
          <ReceiptDocument document={buildReceipt(review)} />
        </div>
      ) : (
        <div className={styles.workspace}>
          <form ref={form} onSubmit={submit} noValidate className={styles.form}>
            <h2>Completá tu recibo</h2>
            <p className={styles.intro}>
              Ingresá los datos del pago recibido. Después vas a poder
              revisarlos.
            </p>
            {!!Object.keys(errors).length && (
              <div
                ref={errorSummary}
                tabIndex={-1}
                role="alert"
                className={styles.errorSummary}
              >
                <p>Revisá los campos indicados antes de continuar.</p>
                <ul>
                  {Object.entries(errors).map(([key, message]) => (
                    <li key={key}>
                      <a
                        href={`#receipt-${key}`}
                        onClick={(event) => {
                          event.preventDefault();
                          const input = document.getElementById(
                            `receipt-${key}`,
                          );
                          const details = input?.closest("details");
                          if (details) details.open = true;
                          input?.focus();
                        }}
                      >
                        {message}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <fieldset>
              <legend>El pago</legend>
              <div className={styles.fields}>
                {field("paymentDate", "Fecha de pago", { type: "date" })}
                {field("period", "Mes del alquiler", { type: "month" })}
                {field("amount", "Importe recibido", {
                  money: true,
                  max: 13,
                  hint: "Sin separadores de miles. Ejemplo: 350000,50.",
                })}
                {select("currency", "Moneda", {
                  ARS: "Pesos argentinos (ARS)",
                  USD: "Dólares estadounidenses (USD)",
                })}
                {select("method", "Medio de pago", PAYMENT_METHODS)}
                {field("paymentReference", "Referencia o detalle del pago", {
                  optional: data.method !== "otro",
                  max: 160,
                  hint: "Número de operación o detalle del medio usado.",
                })}
              </div>
              <label className={styles.checkbox}>
                <input
                  type="checkbox"
                  checked={data.partial}
                  onChange={(e) => update("partial", e.target.checked)}
                />
                El pago es parcial y queda un saldo de este alquiler
              </label>
              {data.partial &&
                field("balance", "Saldo pendiente del período", {
                  money: true,
                  max: 13,
                  hint: "En la misma moneda, sin separadores de miles. No incluyas deudas de otros meses.",
                })}
            </fieldset>
            <fieldset>
              <legend>Las personas y el inmueble</legend>
              <div className={styles.fields}>
                {field("landlordName", "Nombre o razón social del locador")}
                {field("landlordId", "DNI / CUIT del locador", { max: 30 })}
                {field("tenantName", "Nombre o razón social del inquilino")}
                {field("tenantId", "DNI / CUIT del inquilino", { max: 30 })}
              </div>
              {field("address", "Dirección completa del inmueble", {
                max: 240,
                hint: "Incluí piso, departamento y localidad, si corresponde.",
              })}
              {select("collectorRole", "Quién recibe el pago", {
                locador: "El locador",
                representante: "Una persona autorizada por el locador",
              })}
              {data.collectorRole === "representante" && (
                <>
                  <div className={styles.fields}>
                    {field("collectorName", "Nombre de quien cobra")}
                    {field("collectorId", "DNI / CUIT de quien cobra", {
                      max: 30,
                    })}
                  </div>
                  {field("authorization", "Autorización para cobrar", {
                    max: 200,
                    hint: "Referencia de la autorización, por ejemplo su fecha. El formulario no verifica la representación.",
                  })}
                </>
              )}
            </fieldset>
            <fieldset>
              <legend>Referencia y reservas</legend>
              <details className={styles.details}>
                <summary>Agregar referencia, observaciones o reservas</summary>
                {field("reference", "Referencia del recibo", {
                  optional: true,
                  max: 40,
                  hint: "Una referencia propia, sin valor de numeración fiscal.",
                })}
                <div className={styles.field}>
                  <label htmlFor="receipt-reservations">
                    Observaciones y reservas <span>(opcional)</span>
                  </label>
                  <textarea
                    id="receipt-reservations"
                    name="reservations"
                    rows={4}
                    maxLength={600}
                    value={data.reservations}
                    onChange={(e) => update("reservations", e.target.value)}
                    aria-describedby="reservations-hint"
                  />
                  <p id="reservations-hint" className={styles.hint}>
                    Consigná deudas anteriores, intereses u otras reservas que
                    corresponda dejar por escrito. Revisalas antes de firmar.
                  </p>
                </div>
              </details>
            </fieldset>
            <p className={styles.notice}>
              Este recibo deja constancia del pago. No reemplaza el comprobante
              fiscal de ARCA cuando corresponde emitirlo.
            </p>
            <button type="submit" className={styles.primary}>
              Revisar recibo
            </button>
            <p className={styles.hint}>
              Sin cuenta. Los datos se pierden al recargar; descargá el PDF para
              conservarlo.
            </p>
          </form>
          <aside className={styles.preview} aria-label="Modelo del recibo">
            <p className={styles.previewLabel}>Modelo para imprimir</p>
            <BlankReceiptPreview />
            <p className={styles.hint}>
              El PDF tiene fondo blanco, sin trama, y espacio para la firma. Al
              revisar vas a ver el documento con tus datos.
            </p>
          </aside>
        </div>
      )}
    </section>
  );
}

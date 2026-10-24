import { Wordmark } from "@/components/landing/parts";
import { FISCAL_NOTICE } from "@/lib/rental-receipt/model";
import styles from "./receipt.module.css";

/** A compact, labelled sample; the completed review shows the full wording. */
export function BlankReceiptPreview() {
  return (
    <article
      className={`${styles.document} ${styles.sample}`}
      aria-label="Modelo de recibo para imprimir"
    >
      <h3>Recibo de alquiler</h3>
      <p>Fecha: ____ / ____ / ______</p>
      <div className={styles.total}>
        <p>Importe recibido y moneda</p>
        <div className={styles.blankAmount} aria-hidden />
      </div>
      {[
        "Recibí de",
        "DNI / CUIT",
        "Inmueble",
        "Período del alquiler",
        "Locador",
        "Medio de pago",
      ].map((label) => (
        <div className={styles.sampleField} key={label}>
          <span>{label}</span>
          <div aria-hidden />
        </div>
      ))}
      <p>Pago total o parcial, saldo pendiente y reservas.</p>
      <div className={styles.signature}>
        <p>Firma de quien recibe el pago</p>
      </div>
      <p className={styles.fiscal}>{FISCAL_NOTICE}</p>
      <footer>
        <Wordmark size={22} />
        <span>Generado por Factura.uno</span>
      </footer>
    </article>
  );
}

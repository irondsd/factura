import { Wordmark } from "@/components/landing/parts";
import {
  FISCAL_NOTICE,
  type ReceiptDocument as Document,
} from "@/lib/rental-receipt/model";
import styles from "./receipt.module.css";

export function ReceiptDocument({ document }: { document: Document }) {
  return (
    <article
      className={`${styles.document} ph-no-capture ph-mask`}
      data-private
      aria-label="Vista previa del recibo de alquiler"
    >
      <h3>Recibo de alquiler</h3>
      <div className={styles.documentMeta}>
        <p>Fecha de pago: {document.date}</p>
        {document.reference && <p>Referencia: {document.reference}</p>}
      </div>
      <div className={styles.total}>
        <p>Importe recibido</p>
        <strong>{document.amount}</strong>
        <p>Período del alquiler: {document.period}</p>
      </div>
      {document.paragraphs.map((paragraph, index) => (
        <p key={index}>{paragraph}</p>
      ))}
      <h4>Observaciones y reservas</h4>
      <p>
        {document.reservations || "Sin observaciones ni reservas consignadas."}
      </p>
      <div className={styles.signature}>
        <p>Firma de quien recibe el pago</p>
        <p>
          {document.signer}
          <br />
          DNI / CUIT {document.signerId}
        </p>
      </div>
      <p className={styles.fiscal}>{FISCAL_NOTICE}</p>
      <footer>
        <Wordmark size={22} />
        <span>Generado por Factura.uno</span>
      </footer>
    </article>
  );
}

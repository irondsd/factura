"use client";

import { ClosingCta } from "@/components/guides/cta";
import { receiptEvent } from "./analytics";

export function ReceiptCta() {
  return (
    <div
      onClickCapture={(event) => {
        if (event.target instanceof Element && event.target.closest("a"))
          receiptEvent("cta_clicked");
      }}
    >
      <ClosingCta title="¿Cuánto suman los servicios del departamento?">
        El alquiler tiene su recibo y los servicios llegan en boletas aparte.
        Subí las boletas de luz, gas o agua a Factura y compará su importe y
        consumo entre períodos.
      </ClosingCta>
    </div>
  );
}

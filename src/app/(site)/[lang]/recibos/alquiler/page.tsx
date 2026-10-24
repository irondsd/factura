import Link from "next/link";
import { Faq } from "@/components/article/Faq";
import { NEW_TAB, SHELL } from "@/components/landing/parts";
import { BlankReceiptDownload } from "@/components/rental-receipt/BlankReceiptDownload";
import { ReceiptBuilder } from "@/components/rental-receipt/ReceiptBuilder";
import { ReceiptCta } from "@/components/rental-receipt/ReceiptCta";
import { JsonLd } from "@/components/seo/JsonLd";
import { siteUrl } from "@/config/urls";
import { spanishIndexParams } from "@/i18n/routing";
import { faqPageLd } from "@/i18n/structuredData";
import {
  ARCA_URL,
  CIVIL_CODE_URL,
  receiptFaq,
} from "@/lib/rental-receipt/content";
import { RECEIPT_GUIDE, RECEIPT_PATH } from "@/lib/rental-receipt/model";
import { buildMetadata } from "@/lib/seo";

export const dynamicParams = false;
export const generateStaticParams = spanishIndexParams;
export const metadata = buildMetadata({
  url: `${siteUrl}${RECEIPT_PATH}`,
  locale: "es",
  titleAbsolute: true,
  title: "Modelo de recibo de alquiler para rellenar e imprimir",
  description:
    "Modelo de recibo de alquiler para rellenar en Argentina: completá los datos y descargá el PDF gratis, o imprimí el modelo en blanco para llenarlo a mano.",
  keywords: [
    "modelo de recibo de alquiler para rellenar",
    "recibo de alquiler para imprimir gratis",
    "recibo de alquiler para imprimir pdf",
    "recibo de alquiler modelo argentina",
  ],
  images: [
    {
      url: "/og/recibos/alquiler/card.png",
      width: 1200,
      height: 630,
      alt: "Modelo de recibo de alquiler de Factura, para completar e imprimir",
    },
  ],
});

const h2 =
  "font-display text-[26px] font-semibold leading-[1.2] tracking-[-0.02em] sm:text-[29px]";
const prose = "font-mono text-[14.5px] leading-[1.8] text-ink/90";
const link = "text-accent underline underline-offset-4 hover:text-ink";

export default function RentalReceiptPage() {
  return (
    <main className={SHELL}>
      <JsonLd data={faqPageLd(receiptFaq, "es")} />
      <header className="max-w-[790px] pt-12 sm:pt-16">
        <p className="font-mono text-xs text-accent">Recibos de alquiler</p>
        <h1 className="mt-4 font-display text-[36px] font-semibold leading-[1.08] tracking-[-0.025em] sm:text-[48px]">
          Modelo de recibo de alquiler para rellenar e imprimir
        </h1>
        <p className="mt-5 max-w-[680px] font-mono text-[14px] leading-[1.8] text-ink/80">
          Este modelo de recibo de alquiler para rellenar deja constancia de un
          pago en Argentina. Completá los datos y descargá el PDF gratis, sin
          crear una cuenta. Si preferís llenarlo a mano, bajá el modelo en
          blanco.
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-4">
          <BlankReceiptDownload />
          <a
            href="#completar"
            className={`inline-flex min-h-12 items-center font-mono text-[13px] ${link}`}
          >
            Completar el recibo online
          </a>
        </div>
        <p className="mt-4 font-mono text-[12px] leading-[1.8] text-ink/80">
          El recibo no reemplaza el comprobante fiscal de ARCA cuando
          corresponde emitirlo.
        </p>
      </header>

      <ReceiptBuilder />

      <div className="max-w-[760px] pb-16">
        <section className="border-t border-line pt-8">
          <h2 className={h2}>Qué incluye el recibo</h2>
          <p className={`${prose} mt-4`}>
            El documento identifica quién paga, quién cobra y el inmueble
            alquilado. Deja escritos el mes del alquiler, la fecha del pago, el
            importe recibido, la moneda y el medio de pago. Si se recibió solo
            una parte, podés indicar el saldo pendiente de ese período.
          </p>
          <p className={`${prose} mt-4`}>
            El PDF completado y el modelo en blanco tienen espacio para
            observaciones, reservas y la firma de quien recibe el dinero. Una
            referencia propia ayuda a ordenar tus copias; no es un número de
            comprobante fiscal.
          </p>
        </section>
        <section className="mt-12">
          <h2 className={h2}>Cómo hacer el recibo de pago del alquiler</h2>
          <ol className={`${prose} mt-4 list-decimal space-y-3 pl-5`}>
            <li>
              Completá los datos del locador, del inquilino y del inmueble. Si
              cobra otra persona, identificala e indicá la autorización para
              recibir el pago.
            </li>
            <li>
              Indicá el período y el dinero que se recibió, en su moneda. No
              incluyas como recibido un importe que todavía no se pagó.
            </li>
            <li>
              Revisá el saldo pendiente y las reservas. Descargá el PDF y pedí
              la firma de quien cobró; cada parte debería conservar una copia.
            </li>
          </ol>
        </section>
        <section className="mt-12">
          <h2 className={h2}>El recibo y la factura de alquiler</h2>
          <p className={`${prose} mt-4`}>
            El{" "}
            <a href={CIVIL_CODE_URL} {...NEW_TAB} className={link}>
              Código Civil y Comercial
            </a>{" "}
            define el recibo en su artículo 896 y reconoce el derecho a obtener
            una constancia de pago en el 897. Los artículos 898 y 899 regulan
            las reservas y las presunciones sobre períodos anteriores, intereses
            y otros conceptos accesorios. Por eso el modelo permite consignar
            reservas y no declara canceladas todas las deudas del contrato.
          </p>
          <p className={`${prose} mt-4`}>
            Según{" "}
            <a href={ARCA_URL} {...NEW_TAB} className={link}>
              ARCA
            </a>
            , los comprobantes electrónicos del alquiler dependen del régimen
            del locador. Los monotributistas emiten tipo C, que puede ser
            factura o recibo; en el régimen general corresponden comprobantes A,
            B o C según el caso. Este generador no emite comprobantes
            autorizados por ARCA. Para emitirlos, ingresá a sus servicios de
            facturación.
          </p>
        </section>
        <aside className="mt-10 border-l-2 border-accent bg-paper-tint px-5 py-4">
          <h2 className="font-display text-[20px] font-semibold">Aviso</h2>
          <p className={`${prose} mt-2 text-[13px]`}>
            Este modelo deja constancia de los datos que ingresás y se descarga
            sin firma. No verifica el pago, la identidad ni la autorización de
            quien cobra. No reemplaza asesoramiento legal o impositivo sobre tu
            caso. Si hay deudas discutidas, intereses o reservas, revisá su
            redacción con un profesional antes de firmar.
          </p>
        </aside>
        <p className={`${prose} mt-10`}>
          Para las reglas sobre transferencias, efectivo y prueba del pago, leé{" "}
          <Link href={RECEIPT_GUIDE} className={link}>
            cómo pagar y cobrar el alquiler
          </Link>
          . Si todavía estás preparando el acuerdo, podés{" "}
          <Link href="/contratos/vivienda" className={link}>
            completar el contrato de alquiler de vivienda
          </Link>
          .
        </p>
        <Faq items={receiptFaq} />
        <ReceiptCta />
      </div>
    </main>
  );
}

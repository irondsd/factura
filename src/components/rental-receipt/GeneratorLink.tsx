import Link from "next/link";
import { RECEIPT_GUIDE, RECEIPT_PATH } from "@/lib/rental-receipt/model";

/** Ships with the tool, without changing a guide's published CMS fields. */
export function ReceiptGeneratorLink({ slug }: { slug: string }) {
  if (`/guias/${slug}` !== RECEIPT_GUIDE) return null;
  return (
    <aside className="my-8 border-y border-line bg-paper-tint px-5 py-5">
      <p className="m-0 font-display text-[23px] font-semibold leading-snug">
        Completá un recibo de alquiler y descargalo en PDF
      </p>
      <p className="mt-2 mb-4 font-mono text-[13px] leading-[1.8] text-ink/80">
        Dejá constancia del pago recibido o descargá el modelo en blanco para
        imprimir, gratis y sin cuenta. No reemplaza un comprobante fiscal.
      </p>
      <Link
        href={RECEIPT_PATH}
        className="inline-flex min-h-11 items-center border border-accent bg-accent px-4 py-2 font-mono text-[13px] text-white no-underline hover:bg-ink hover:border-ink focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
      >
        Crear recibo de alquiler
      </Link>
    </aside>
  );
}

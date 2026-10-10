import Link from "next/link";
import {
  contractGuide,
  contractPath,
  CONTRACT_TYPES,
} from "@/lib/rental-contract/model";

/** Contextual links stay with the tool release, without rewriting CMS articles. */
export function GeneratorLink({ slug }: { slug: string }) {
  const type = CONTRACT_TYPES.find(
    (candidate) => contractGuide(candidate) === `/guias/${slug}`,
  );
  if (!type) return null;
  return (
    <aside className="my-8 border-y border-line bg-paper-tint px-5 py-5">
      <p className="m-0 font-display text-[23px] font-semibold leading-snug">
        Completá tu contrato y descargalo en PDF
      </p>
      <p className="mt-2 mb-4 font-mono text-[13px] leading-[1.8] text-muted">
        Ingresá los datos del alquiler{" "}
        {type === "vivienda" ? "de vivienda permanente" : "comercial"} y revisá
        el documento antes de firmar. Sin crear una cuenta.
      </p>
      <Link
        href={contractPath(type)}
        className="inline-block border border-accent bg-accent px-4 py-2 font-mono text-[13px] text-white no-underline hover:bg-ink hover:border-ink"
      >
        Crear contrato {type === "vivienda" ? "de vivienda" : "comercial"}
      </Link>
    </aside>
  );
}

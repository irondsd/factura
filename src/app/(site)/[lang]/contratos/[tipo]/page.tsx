import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ContractBuilder } from "@/components/rental-contract/ContractBuilder";
import { SHELL } from "@/components/landing/parts";
import { spanishOnly } from "@/i18n/routing";
import { buildMetadata } from "@/lib/seo";
import { siteUrl } from "@/config/urls";
import {
  CONTRACT_TYPES,
  contractPath,
  type ContractType,
} from "@/lib/rental-contract/model";

export const dynamicParams = false;
export const generateStaticParams = () =>
  spanishOnly(async () => CONTRACT_TYPES.map((tipo) => ({ tipo })));
type Props = { params: Promise<{ tipo: string }> };
function isType(value: string): value is ContractType {
  return CONTRACT_TYPES.some((type) => type === value);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { tipo } = await params;
  if (!isType(tipo)) return {};
  return buildMetadata({
    url: `${siteUrl}${contractPath(tipo)}`,
    locale: "es",
    titleAbsolute: true,
    title:
      tipo === "vivienda"
        ? "Generador de contrato de alquiler de vivienda | Factura.uno"
        : "Generador de contrato de alquiler comercial | Factura.uno",
    description: `Completá los datos de tu alquiler ${tipo === "vivienda" ? "de vivienda permanente" : "comercial"}, revisá el contrato y descargá un PDF con la identidad de Factura.uno. Sin registro.`,
  });
}

export default async function ContractPage({ params }: Props) {
  const { tipo } = await params;
  if (!isType(tipo)) notFound();
  return (
    <main className={SHELL}>
      <header className="max-w-[760px] pt-12 sm:pt-16">
        <p className="font-mono text-xs text-accent">Contratos de alquiler</p>
        <h1 className="mt-4 font-display text-[36px] font-semibold leading-[1.08] tracking-[-0.025em] sm:text-[48px]">
          Tu contrato de alquiler
          {tipo === "comercial" ? " comercial" : " de vivienda"}, listo para
          revisar.
        </h1>
        <p className="mt-5 max-w-[660px] font-mono text-[14px] leading-[1.8] text-muted">
          Completá los datos, revisá las cláusulas y generá un PDF para
          descargar y firmar. Con el papel, las fuentes y la identidad de
          Factura.uno.
        </p>
      </header>
      <ContractBuilder key={tipo} type={tipo} />
    </main>
  );
}

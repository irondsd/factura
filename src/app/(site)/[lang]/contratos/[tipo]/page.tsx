import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Faq } from "@/components/article/Faq";
import { ClosingCta } from "@/components/guides/cta";
import { BlankContractDownload } from "@/components/rental-contract/BlankContractDownload";
import { ContractBuilder } from "@/components/rental-contract/ContractBuilder";
import { Eyebrow, NEW_TAB, SHELL } from "@/components/landing/parts";
import { JsonLd } from "@/components/seo/JsonLd";
import { spanishOnly } from "@/i18n/routing";
import { faqPageLd } from "@/i18n/structuredData";
import { buildMetadata } from "@/lib/seo";
import { siteUrl } from "@/config/urls";
import {
  CODIGO_CIVIL_URL,
  CONTRACT_COPY,
  DNU_70_2023_URL,
  clauseList,
  fieldInfo,
} from "@/lib/rental-contract/content";
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
  const copy = CONTRACT_COPY[tipo];
  return buildMetadata({
    url: `${siteUrl}${contractPath(tipo)}`,
    locale: "es",
    titleAbsolute: true,
    title: copy.title,
    description: copy.description,
    keywords: copy.keywords,
  });
}

const h2 =
  "font-display text-[26px] font-semibold leading-[1.15] tracking-[-0.02em] sm:text-[29px]";
const prose = "font-mono text-[14.5px] leading-[1.8] text-ink/90";
const link = "text-accent underline underline-offset-4 hover:text-ink";

export default async function ContractPage({ params }: Props) {
  const { tipo } = await params;
  if (!isType(tipo)) notFound();
  const copy = CONTRACT_COPY[tipo];
  const info = fieldInfo(tipo);
  const agreed = [
    ["Plazo", info.term],
    ["Moneda", info.currency],
    ["Precio", info.rent],
    ["Actualización", info.adjustment],
    ["Garantía", info.guarantee],
  ] as const;
  return (
    <main className={SHELL}>
      <JsonLd data={faqPageLd(copy.faq, "es")} />
      <header className="max-w-[760px] pt-12 sm:pt-16">
        <p className="font-mono text-xs text-accent">{copy.eyebrow}</p>
        <h1 className="mt-4 font-display text-[36px] font-semibold leading-[1.08] tracking-[-0.025em] sm:text-[48px]">
          {copy.heading}
        </h1>
        <p className="mt-5 max-w-[660px] font-mono text-[14px] leading-[1.8] text-muted">
          {copy.intro}
        </p>
        <BlankContractDownload type={tipo} className="mt-6" />
      </header>
      <ContractBuilder key={tipo} type={tipo} />

      <div className="max-w-[760px] pb-16">
        <section className="mt-16 border-t border-line pt-8">
          <h2 className={h2}>Qué incluye el contrato</h2>
          <p className={`${prose} mt-4`}>
            El PDF completado y el modelo en blanco tienen las mismas cláusulas
            numeradas y terminan con los espacios para las firmas de las partes
            y, si hay fianza, de quienes salen de fiadores:
          </p>
          <ul className={`${prose} mt-3 list-disc pl-5`}>
            {clauseList(tipo).map((clause) => (
              <li key={clause}>{clause}</li>
            ))}
          </ul>
        </section>

        <section className="mt-12">
          <h2 className={h2}>Qué ley rige el contrato</h2>
          <p className={`${prose} mt-4`}>
            El modelo incorpora los cambios del{" "}
            <a href={DNU_70_2023_URL} className={link} {...NEW_TAB}>
              DNU 70/2023
            </a>
            , vigente desde el 29 de diciembre de 2023. Su artículo 249 derogó
            la Ley 27.551 de alquileres, y sus artículos 250 a 263 reescribieron
            las reglas del Código Civil y Comercial sobre moneda, depósito,
            plazo, actualización y rescisión anticipada.
          </p>
          <p className={`${prose} mt-4`}>
            Lo que regula hoy un alquiler está en el capítulo de locación del{" "}
            <a href={CODIGO_CIVIL_URL} className={link} {...NEW_TAB}>
              Código Civil y Comercial
            </a>{" "}
            (artículos 1187 a 1226): la forma escrita, el plazo máximo, quién
            paga cada reparación, la fianza, cómo se resuelve el contrato y cómo
            se devuelve el inmueble. Los contratos firmados antes del DNU siguen
            con la ley vigente cuando se firmaron, hasta que terminen.
          </p>
          <h3 className="mt-8 font-display text-[20px] font-semibold">
            Qué pueden acordar las partes
          </h3>
          <dl className="mt-3 border-t border-line">
            {agreed.map(([term, item]) => (
              <div key={term} className="border-b border-line py-4">
                <dt className="font-display text-[17px] font-semibold">
                  {term}
                </dt>
                <dd className={`${prose} ml-0 mt-1 text-[13.5px]`}>
                  {item.text}
                  {"link" in item && (
                    <>
                      {" "}
                      <Link href={item.link.href} className={link}>
                        {item.link.label}
                      </Link>
                      .
                    </>
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        <aside className="mt-10 border-l-2 border-accent bg-paper-tint px-5 py-4">
          <Eyebrow tone="accent">Aviso</Eyebrow>
          <p className={`${prose} mt-2 text-[13.5px]`}>
            Este es un contrato tipo, pensado para un alquiler común, y no
            reemplaza el asesoramiento legal sobre tu caso. Antes de firmar,
            revisalo con un abogado o un escribano, sobre todo si hay varias
            personas de cada lado, una sociedad, obras o una garantía distinta
            de la fianza personal.
          </p>
        </aside>

        <p className={`${prose} mt-10`}>
          {copy.guide.text}{" "}
          <Link href={copy.guide.href} className={link}>
            {copy.guide.label}
          </Link>
          .
        </p>

        <Faq items={copy.faq} />

        <ClosingCta title={copy.closing.title}>{copy.closing.text}</ClosingCta>
      </div>
    </main>
  );
}

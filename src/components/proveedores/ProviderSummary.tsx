import { Badge } from "@/components/ui/Badge";
import { JsonLd } from "@/components/seo/JsonLd";
import { siteUrl } from "@/config/urls";
import { MediaImage } from "@/content-system/media/MediaImage";
import type { MediaRef } from "@/content-system/media/repository";
import type { ProviderMetadata } from "@/content-system/types";
import { cn } from "@/lib/cn";

// The company card at the top of a /proveedores page: who the company is, the
// four figures a reader comes for, and the identifiers that appear on the bill.
//
// The body writes a bare `<ProviderSummary />` and the route binds it, like
// `<Faq />`: the card's data is `metadata.provider`, edited in the CMS's
// «Componentes» tab with the logo picked from the media library, and the name
// is the page's `vendor`.
//
// One card, two arrangements, switched on the card's *own* width rather than
// the viewport's. The design's desktop form (a masthead beside the logo, four
// figures in a row, the identifiers as one wrapped line) wants about 36rem; the
// article column gives it 680px on a desktop and a phone's width on a phone,
// and a container query is what lets the same card be right in both — and in
// the CMS preview, whose frame is neither.

/** Grid columns for the wide arrangement, by how many figures are filled. A
 * lookup rather than an interpolated class so Tailwind can see every name. */
const WIDE_COLUMNS = [
  "",
  "@xl:grid-cols-1",
  "@xl:grid-cols-2",
  "@xl:grid-cols-3",
  "@xl:grid-cols-4",
] as const;

const LINK =
  "text-accent underline decoration-dotted underline-offset-4 transition-colors hover:text-ink";

/** "https://www.aysa.com.ar/" → "aysa.com.ar": the address as a reader would
 * type it. */
export function displayHost(url: string): string {
  return url
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/$/, "");
}

export function ProviderSummary({
  name,
  value,
  logo,
}: {
  /** The page's `vendor`, or its title when that is empty. */
  name: string;
  value: ProviderMetadata;
  /** `value.logoMediaId`, resolved by the route. */
  logo?: MediaRef | null;
}) {
  const { website, cuit, legalName, regulator, billName } = value;
  const services = (value.services ?? []).filter((s) => s.trim() !== "");
  const logoMedia = logo ?? undefined;

  const figures = [
    { label: "Clientes", value: value.customers, note: value.customersNote },
    { label: "Desde", value: value.since, note: value.sinceNote },
    { label: "Tipo", value: value.kind, note: value.kindNote },
    { label: "Sede", value: value.headquarters, note: value.headquartersNote },
  ].filter(
    (
      figure,
    ): figure is { label: string; value: string; note: string | undefined } =>
      Boolean(figure.value),
  );

  const facts = [
    { label: "CUIT", value: cuit },
    { label: "Razón social", value: legalName },
    { label: "Regulador", value: regulator },
  ].filter((fact): fact is { label: string; value: string } =>
    Boolean(fact.value),
  );
  const showBillName = Boolean(billName && billName !== legalName);

  const logoUrl = logoMedia
    ? logoMedia.src.startsWith("http")
      ? logoMedia.src
      : `${siteUrl}${logoMedia.src}`
    : undefined;

  return (
    <section
      aria-label={`Ficha de ${name}`}
      className="@container my-8 first:mt-0"
    >
      {/* Only what the card shows, so the markup never claims more than the
          reader can see. */}
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Organization",
          name,
          ...(legalName ? { legalName } : {}),
          ...(cuit ? { taxID: cuit } : {}),
          ...(website ? { url: website } : {}),
          ...(logoUrl ? { logo: logoUrl } : {}),
        }}
      />

      <div className="fd-card flex flex-col">
        {/* ── Masthead ─────────────────────────────────────────────── */}
        <div className="flex flex-col gap-3.5 px-[18px] pt-5 pb-[18px] @xl:flex-row @xl:items-center @xl:gap-6 @xl:px-7 @xl:pt-7 @xl:pb-6">
          {logoMedia && (
            <div className="flex h-[70px] w-[140px] flex-none items-center justify-center border border-line bg-paper p-2">
              <MediaImage
                media={logoMedia}
                alt={`Logo de ${name}`}
                placement="logo"
                className="h-full w-full object-contain"
              />
            </div>
          )}
          <div className="flex min-w-0 flex-1 flex-col gap-3.5 @xl:gap-2.5">
            <h2 className="m-0 font-display text-[26px] leading-[1.1] font-semibold tracking-[-0.02em] text-balance text-ink @xl:text-[30px]">
              ¿Qué es {name}
              <span className="text-accent">?</span>
            </h2>
            {(services.length > 0 || website) && (
              <div className="flex flex-wrap items-center gap-2">
                {services.map((service) => (
                  <Badge key={service} tone="neutral">
                    {service}
                  </Badge>
                ))}
                {website && (
                  <>
                    {services.length > 0 && (
                      <span
                        aria-hidden="true"
                        className="hidden text-[12px] text-muted @xl:inline"
                      >
                        ·
                      </span>
                    )}
                    {/* Its own line on a phone, where the tap target needs
                        the room; inline after the services when wide. */}
                    <a
                      href={website}
                      rel="noopener"
                      className={cn(
                        LINK,
                        "flex min-h-6 basis-full items-center text-[13px] @xl:inline @xl:min-h-0 @xl:basis-auto @xl:text-[12px]",
                      )}
                    >
                      {displayHost(website)}
                    </a>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Figures ──────────────────────────────────────────────── */}
        {/* Two across on a phone, one row when wide. The rules between cells
            are the grid's 1px gap over the line colour, so they stay right
            for any count; an odd last figure spans the phone row rather than
            leaving a hole. */}
        {figures.length > 0 && (
          <dl
            className={cn(
              "m-0 grid grid-cols-2 gap-px border-t border-line bg-line",
              "[&>div:last-child:nth-child(odd)]:col-span-2 @xl:[&>div:last-child:nth-child(odd)]:col-span-1",
              WIDE_COLUMNS[figures.length],
            )}
          >
            {figures.map((figure) => (
              <div
                key={figure.label}
                className="flex flex-col gap-1 bg-card px-[18px] py-3.5 @xl:gap-1.5 @xl:px-7 @xl:py-[18px]"
              >
                <dt className="fd-label">{figure.label}</dt>
                <dd className="m-0 font-display text-[22px] leading-[1.15] font-semibold tracking-[-0.01em] text-ink @xl:text-[26px]">
                  {figure.value}
                </dd>
                {figure.note && (
                  <dd className="m-0 text-[11px] text-muted">{figure.note}</dd>
                )}
              </div>
            ))}
          </dl>
        )}

        {/* ── Identifiers ──────────────────────────────────────────── */}
        {/* Stacked label/value rows on a phone; one wrapped line when wide. */}
        {(facts.length > 0 || showBillName) && (
          <dl className="m-0 flex flex-col border-t border-line bg-paper px-[18px] pt-1 pb-1.5 text-[12px] @xl:flex-row @xl:flex-wrap @xl:gap-x-7 @xl:gap-y-2 @xl:px-7 @xl:py-3.5">
            {facts.map((fact) => (
              <div
                key={fact.label}
                className="flex justify-between gap-3 border-t border-line/60 py-[9px] first:border-t-0 @xl:justify-start @xl:gap-1.5 @xl:border-t-0 @xl:py-0"
              >
                <dt className="text-muted">{fact.label}</dt>
                <dd className="m-0 text-right text-ink @xl:text-left">
                  {fact.value}
                </dd>
              </div>
            ))}
            {showBillName && (
              <div className="flex flex-col gap-[3px] border-t border-line/60 py-[9px] first:border-t-0 @xl:flex-row @xl:gap-1.5 @xl:border-t-0 @xl:py-0">
                <dt className="text-muted">
                  <span aria-hidden="true" className="text-accent">
                    △
                  </span>{" "}
                  En la factura figura como
                </dt>
                <dd className="m-0 text-ink">{billName}</dd>
              </div>
            )}
          </dl>
        )}
      </div>
    </section>
  );
}

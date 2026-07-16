/**
 * Email 4 — Monthly report / month closing.
 * Fired when the last expected bill for a property's month lands (every vendor
 * that bills that property now has a parsed bill for the period). Sent to every
 * member of the property.
 *
 * Layout: the month total in ARS as the headline (USD in smaller muted text
 * below), then one bordered card per vendor — vendor ARS as the main figure, USD
 * beneath, and the month-over-month (and, when known, year-over-year) % change.
 */

import { Button, Column, Row, Section, Text } from "@react-email/components";
import * as React from "react";
import { type Dictionary, interpolate, type Locale } from "../src/i18n/config";
import { formatARS, formatMonth, formatUSD } from "../src/lib/format";
import en from "../src/i18n/dictionaries/en.json";
import { C, FacturaEmail, styles } from "./components/factura-email";

type Emails = Dictionary["emails"];

// Vendor swatch hexes mirror `--vendor-*` in src/app/globals.css. Email can't
// reach CSS variables, so the palette is duplicated here as literal hex — keep
// in sync with globals.css / lib/vendorColors.
const VENDOR_HEX: Record<string, string> = {
  "burnt-orange": "#d9480f",
  amber: "#c98a1a",
  sage: "#7d8471",
  taupe: "#9a8c74",
  earth: "#6b5a45",
  "slate-teal": "#5f7470",
  "dark-earth": "#4a4034",
  rust: "#a8501f",
  ochre: "#8a6d3b",
  olive: "#6f7d52",
  terracotta: "#9c6b4f",
  khaki: "#807356",
  clay: "#b08968",
  moss: "#5c6b5d",
};

// Semantic delta colors — an increase (more expensive) reads as attention, a
// decrease as relief. Kept off the brand accent so the orange stays scarce.
const DELTA_UP = "#b3401a";
const DELTA_DOWN = "#4f7a52";

const mono = "'IBM Plex Mono', 'Courier New', Courier, monospace";
const serif = "'Fraunces', Georgia, 'Times New Roman', serif";

export type ReportVendor = {
  /** Display name of the vendor. */
  name: string;
  /** Vendor color *name* (see lib/vendorColors); unknown → neutral swatch. */
  color?: string;
  /** Month total for this vendor in ARS. */
  ars: number;
  /** Same total converted to USD at the bill's rate, or null when unavailable. */
  usd?: number | null;
  /** % change vs. the prior month (null when there's no prior month on record). */
  momPct?: number | null;
  /** % change vs. the same month last year (null when unavailable). */
  yoyPct?: number | null;
};

export type MonthlyReportEmailProps = {
  /** Resolved `emails` dictionary slice for the recipient's locale. */
  t?: Emails;
  locale?: Locale;
  /** Property nickname. */
  property?: string;
  /** Reporting month as "YYYY-MM" (or a full date). */
  month?: string;
  /** Month total in ARS across all vendors. */
  totalArs?: number;
  /** Month total in USD, or null when the rate is unavailable. */
  totalUsd?: number | null;
  /** One entry per vendor that billed this property this month. */
  vendors?: ReportVendor[];
  /** Link into the app (property ledger). */
  ledgerUrl?: string;
};

/** One "LABEL  ▲ +12%" delta line. The label may wrap on a narrow card, but the
 * arrow + percent stay glued together (inner nowrap) so a number never splits. */
function DeltaLine({
  label,
  pct,
  last = false,
}: {
  label: string;
  pct: number;
  last?: boolean;
}) {
  const rounded = Math.round(pct);
  const up = rounded > 0;
  const down = rounded < 0;
  const color = up ? DELTA_UP : down ? DELTA_DOWN : C.muted;
  const arrow = up ? "▲" : down ? "▼" : "—";
  const sign = rounded > 0 ? "+" : "";
  return (
    <Text
      style={{
        fontFamily: mono,
        fontSize: "12px",
        color: C.muted,
        margin: last ? 0 : "0 0 4px",
      }}
    >
      {label}{" "}
      <span style={{ color, fontWeight: 500, whiteSpace: "nowrap" }}>
        {arrow} {sign}
        {rounded}%
      </span>
    </Text>
  );
}

function VendorCard({
  vendor,
  t,
}: {
  vendor: ReportVendor;
  t: Emails["monthlyReport"];
}) {
  const swatch = (vendor.color && VENDOR_HEX[vendor.color]) || C.muted;
  const hasMom = vendor.momPct !== null && vendor.momPct !== undefined;
  const hasYoy = vendor.yoyPct !== null && vendor.yoyPct !== undefined;
  return (
    <Section
      style={{
        border: `1px solid ${C.line}`,
        backgroundColor: C.paper,
        margin: "0 0 12px",
      }}
    >
      {/* Top row: name (left) + amount (right). Both are short, so they sit
          side-by-side even on a narrow phone without forcing overflow. */}
      <Row>
        <Column
          style={{
            padding: "14px 16px 10px",
            verticalAlign: "middle",
          }}
        >
          <Text
            style={{
              fontFamily: mono,
              fontSize: "11px",
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: C.ink,
              margin: 0,
            }}
          >
            <span
              style={{
                display: "inline-block",
                width: "9px",
                height: "9px",
                backgroundColor: swatch,
                marginRight: "8px",
                verticalAlign: "middle",
              }}
            />
            {vendor.name}
          </Text>
        </Column>
        <Column
          style={{
            padding: "14px 16px 10px",
            verticalAlign: "middle",
            textAlign: "right",
            whiteSpace: "nowrap",
          }}
        >
          <Text
            style={{
              fontFamily: serif,
              fontWeight: 600,
              fontSize: "20px",
              lineHeight: "1.1",
              color: C.ink,
              margin: "0 0 2px",
            }}
          >
            {formatARS(vendor.ars)}
          </Text>
          <Text
            style={{
              fontFamily: mono,
              fontSize: "12px",
              color: C.muted,
              margin: 0,
            }}
          >
            {vendor.usd != null
              ? interpolate(t.usdApprox, { amount: formatUSD(vendor.usd) })
              : "—"}
          </Text>
        </Column>
      </Row>
      {/* Deltas get the full card width on their own row — this is the long
          content that used to squeeze the amount off-screen. */}
      <Row>
        <Column
          style={{
            padding: "10px 16px 14px",
            borderTop: `1px solid ${C.line}`,
          }}
        >
          {hasMom ? (
            <DeltaLine
              label={t.vsLastMonth}
              pct={vendor.momPct as number}
              last={!hasYoy}
            />
          ) : (
            <Text
              style={{
                fontFamily: mono,
                fontSize: "12px",
                color: C.muted,
                margin: 0,
              }}
            >
              {t.noComparison}
            </Text>
          )}
          {hasYoy ? (
            <DeltaLine
              label={t.vsLastYear}
              pct={vendor.yoyPct as number}
              last
            />
          ) : null}
        </Column>
      </Row>
    </Section>
  );
}

export function MonthlyReportEmail({
  t = en.emails,
  locale = "en",
  property = "Your property",
  month = "2026-06",
  totalArs = 0,
  totalUsd = null,
  vendors = [],
  ledgerUrl = "https://example.com/app",
}: MonthlyReportEmailProps) {
  const r = t.monthlyReport;
  const monthLabel = formatMonth(month, locale);
  return (
    <FacturaEmail
      locale={locale}
      preheader={interpolate(r.preheader, {
        month: monthLabel,
        total: formatARS(totalArs),
        count: vendors.length,
      })}
      headerTag={t.headerReport}
      eyebrow={r.eyebrow}
      title={monthLabel}
      footerNote={r.footerNote}
      footerTagline={t.footerTagline}
      unsubscribeLabel={t.unsubscribe}
    >
      <Text style={styles.text}>
        {interpolate(r.intro, { property, month: monthLabel })}
      </Text>

      {/* Headline total */}
      <Section
        style={{
          marginTop: "20px",
          padding: "20px 22px",
          border: `1px solid ${C.line}`,
          backgroundColor: C.paper,
        }}
      >
        <Text
          style={{
            fontFamily: mono,
            fontSize: "11px",
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            color: C.muted,
            margin: "0 0 8px",
          }}
        >
          {r.totalLabel}
        </Text>
        <Text
          style={{
            fontFamily: serif,
            fontWeight: 600,
            fontSize: "40px",
            lineHeight: "1.05",
            letterSpacing: "-0.01em",
            color: C.ink,
            margin: "0 0 6px",
          }}
        >
          {formatARS(totalArs)}
        </Text>
        <Text
          style={{
            fontFamily: mono,
            fontSize: "13px",
            color: C.muted,
            margin: 0,
          }}
        >
          {totalUsd != null
            ? interpolate(r.usdApprox, { amount: formatUSD(totalUsd) })
            : "—"}
        </Text>
      </Section>

      {/* Per-vendor breakdown */}
      <Text
        style={{
          fontFamily: mono,
          fontSize: "11px",
          letterSpacing: "0.2em",
          textTransform: "uppercase",
          color: C.muted,
          margin: "28px 0 12px",
        }}
      >
        {r.breakdownLabel}
      </Text>
      {vendors.map((v) => (
        <VendorCard key={v.name} vendor={v} t={r} />
      ))}

      <Section style={{ padding: "16px 0 0" }}>
        <Button href={ledgerUrl} style={styles.button}>
          {r.button}
        </Button>
      </Section>
      <Text style={{ ...styles.voice, margin: "14px 0 0" }}>{r.voice}</Text>
    </FacturaEmail>
  );
}

// Preview defaults for `email dev`.
MonthlyReportEmail.PreviewProps = {
  property: "Av. Córdoba 1247 · 4B",
  month: "2026-06",
  totalArs: 187_430,
  totalUsd: 148.3,
  vendors: [
    {
      name: "Edesur",
      color: "burnt-orange",
      ars: 84_210,
      usd: 66.6,
      momPct: 12.4,
      yoyPct: 186.2,
    },
    {
      name: "Metrogas",
      color: "slate-teal",
      ars: 61_890,
      usd: 48.9,
      momPct: -4.1,
      yoyPct: 143.7,
    },
    {
      name: "AySA",
      color: "sage",
      ars: 41_330,
      usd: 32.7,
      momPct: 0,
      yoyPct: null,
    },
  ],
} satisfies MonthlyReportEmailProps;

export default MonthlyReportEmail;

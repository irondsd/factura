/**
 * Factura — universal transactional email shell (react-email)
 * ----------------------------------------------------------------------------
 * One brand frame (wordmark header, paper card, footer); pass `children` for
 * the body and compose any transactional email. The only things that change
 * per email are the `eyebrow`, `title`, body content, and `headerTag` — every
 * template in this folder renders through this single shell.
 *
 * Ported from the Factura design system (templates/email/FacturaEmail.jsx).
 * Brand tokens mirror src/app/globals.css / the design tokens:
 *   paper #f4efe3 · card #fdfbf4 · ink #211d16 · muted #857b67
 *   line #ddd2bb · accent #d9480f
 *
 * Email caveats (kept deliberately): the dotted-grid page texture and the torn
 * receipt edge are dropped — CSS masks / background-image are unreliable across
 * clients. The look carries on hairline borders, square corners, Fraunces +
 * IBM Plex Mono, and the orange wordmark dot. The lone accent is reserved for
 * links, the wordmark dot, and the decline link — keep it scarce.
 */

import {
  Body,
  Column,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Row,
  Section,
  Text,
} from "@react-email/components";
import * as React from "react";

/* ── Tokens ──────────────────────────────────────────────────────────────── */
export const C = {
  paper: "#f4efe3",
  card: "#fdfbf4",
  ink: "#211d16",
  muted: "#857b67",
  line: "#ddd2bb",
  accent: "#d9480f",
} as const;

const serif = "'Fraunces', Georgia, 'Times New Roman', serif";
const mono = "'IBM Plex Mono', 'Courier New', Courier, monospace";

/* ── Reusable styles ─────────────────────────────────────────────────────── */
export const styles = {
  body: { backgroundColor: C.paper, margin: 0, padding: "32px 0" },
  card: {
    width: "100%",
    maxWidth: "600px",
    backgroundColor: C.card,
    border: `1px solid ${C.line}`,
    margin: "0 auto",
  },
  headPad: { padding: "24px 40px", borderBottom: `1px solid ${C.line}` },
  bodyPad: { padding: "40px 40px 8px" },
  footPad: { padding: "0 40px 36px" },
  wordmark: {
    fontFamily: serif,
    fontWeight: 600,
    fontSize: "20px",
    letterSpacing: "-0.01em",
    color: C.ink,
    margin: 0,
  },
  headTag: {
    fontFamily: mono,
    fontSize: "11px",
    letterSpacing: "0.2em",
    textTransform: "uppercase",
    color: C.muted,
    margin: 0,
    textAlign: "right",
  },
  eyebrow: {
    fontFamily: mono,
    fontSize: "11px",
    letterSpacing: "0.2em",
    textTransform: "uppercase",
    color: C.muted,
    margin: "0 0 16px",
  },
  title: {
    fontFamily: serif,
    fontWeight: 600,
    fontSize: "36px",
    lineHeight: "1.15",
    letterSpacing: "-0.01em",
    color: C.ink,
    margin: "0 0 20px",
  },
  text: {
    fontFamily: mono,
    fontSize: "14px",
    lineHeight: "1.6",
    color: C.ink,
    margin: "0 0 16px",
  },
  button: {
    backgroundColor: C.ink,
    color: C.paper,
    fontFamily: mono,
    fontSize: "13px",
    fontWeight: 500,
    letterSpacing: "0.04em",
    padding: "13px 24px",
    textDecoration: "none",
    borderRadius: 0,
    whiteSpace: "nowrap",
  },
  voice: { fontFamily: mono, fontSize: "12px", color: C.muted, margin: 0 },
  footWordmark: {
    fontFamily: serif,
    fontWeight: 600,
    fontSize: "16px",
    letterSpacing: "-0.01em",
    color: C.ink,
    margin: "0 0 8px",
  },
  footLine: {
    fontFamily: mono,
    fontSize: "11px",
    lineHeight: "1.6",
    color: C.muted,
    margin: "0 0 6px",
  },
  dottedLink: {
    color: C.muted,
    textDecoration: "underline",
    textDecorationStyle: "dotted",
  },
  accentLink: {
    color: C.accent,
    textDecoration: "underline",
    textDecorationStyle: "dotted",
  },
} satisfies Record<string, React.CSSProperties>;

/* The orange brand period. */
const Dot = () => <span style={{ color: C.accent }}>.</span>;

const FONTS_HREF =
  "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500..600&family=IBM+Plex+Mono:wght@400;500;600&display=swap";

export type FacturaEmailProps = {
  /** Hidden inbox-preview text. */
  preheader?: string;
  /** Mono uppercase tag in the top-right of the header band. */
  headerTag?: string;
  /** Mono uppercase label above the title. */
  eyebrow?: string;
  /** Fraunces display title. */
  title: React.ReactNode;
  /** Body content — Text / detail blocks / CTA. */
  children: React.ReactNode;
  /** Footer disclosure line. */
  footerNote?: string;
  /** Unsubscribe target. */
  unsubscribeUrl?: string;
  /** BCP-47 language for the <Html lang> attribute. */
  locale?: string;
  /** Localized footer tagline under the wordmark. */
  footerTagline?: string;
  /** Localized label for the unsubscribe link. */
  unsubscribeLabel?: string;
};

/* ── Universal shell ─────────────────────────────────────────────────────── */
export function FacturaEmail({
  preheader,
  headerTag = "Account",
  eyebrow,
  title,
  children,
  footerNote = "You're receiving this because you have a Factura account.",
  unsubscribeUrl = "https://example.com/unsubscribe",
  locale = "en",
  footerTagline = "Personal utility ledger · Argentina",
  unsubscribeLabel = "Unsubscribe",
}: FacturaEmailProps) {
  return (
    <Html lang={locale}>
      <Head>
        {/* Webfonts via <link> as the source HTML does — supporting clients and
            the preview get Fraunces + IBM Plex Mono; everywhere else falls back
            to the Georgia / monospace stacks baked into every style above. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin=""
        />
        <link href={FONTS_HREF} rel="stylesheet" />
        <meta name="color-scheme" content="light only" />
        <meta name="supported-color-schemes" content="light only" />
        {/* On narrow screens the card shrinks to device width (width:100%,
            max-width:600px); pull the 40px side padding in so the body text
            keeps a comfortable measure. !important is needed to beat the inline
            padding on the same element. */}
        <style
          dangerouslySetInnerHTML={{
            __html: `@media only screen and (max-width:620px){
              .px-pad{padding-left:24px!important;padding-right:24px!important;}
            }`,
          }}
        />
      </Head>
      {preheader ? <Preview>{preheader}</Preview> : null}
      <Body style={styles.body}>
        <Container style={styles.card}>
          {/* Header band */}
          <Section className="px-pad" style={styles.headPad}>
            <Row>
              <Column>
                <Text style={styles.wordmark}>
                  Factura
                  <Dot />
                </Text>
              </Column>
              <Column>
                <Text style={styles.headTag}>{headerTag}</Text>
              </Column>
            </Row>
          </Section>

          {/* Body */}
          <Section className="px-pad" style={styles.bodyPad}>
            {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
            <Heading as="h1" style={styles.title}>
              {title}
            </Heading>
            {children}
          </Section>

          {/* Footer */}
          <Section className="px-pad" style={{ padding: "0 40px" }}>
            <Hr style={{ borderColor: C.line, margin: "24px 0" }} />
          </Section>
          <Section className="px-pad" style={styles.footPad}>
            <Text style={styles.footWordmark}>
              Factura
              <Dot />
            </Text>
            <Text style={styles.footLine}>{footerTagline}</Text>
            <Text style={styles.footLine}>
              {footerNote}{" "}
              <Link href={unsubscribeUrl} style={styles.dottedLink}>
                {unsubscribeLabel}
              </Link>
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

/* A ledger-style detail row: LABEL · value (used by the invite email). */
export function DetailRow({
  label,
  value,
  last = false,
}: {
  label: string;
  value: React.ReactNode;
  last?: boolean;
}) {
  return (
    <Row style={{ borderBottom: last ? "none" : `1px solid ${C.line}` }}>
      <Column style={{ padding: "14px 16px" }}>
        <span
          style={{
            display: "inline-block",
            width: "96px",
            fontFamily: mono,
            fontSize: "11px",
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            color: C.muted,
            verticalAlign: "middle",
          }}
        >
          {label}
        </span>
        <span
          style={{
            fontFamily: mono,
            fontSize: "13px",
            color: C.ink,
            verticalAlign: "middle",
          }}
        >
          {value}
        </span>
      </Column>
    </Row>
  );
}

/**
 * Email 2 — Shared property / accept invite.
 * Same shell as the welcome email — adds a ledger-style detail block and a
 * secondary "decline" line.
 */

import { Button, Link, Section, Text } from "@react-email/components";
import * as React from "react";
import { type Dictionary, interpolate, type Locale } from "../src/i18n/config";
import en from "../src/i18n/dictionaries/en.json";
import { C, DetailRow, FacturaEmail, styles } from "./components/factura-email";

type Emails = Dictionary["emails"];

export type ShareInviteEmailProps = {
  /** Resolved `emails` dictionary slice for the recipient's locale. */
  t?: Emails;
  locale?: Locale;
  name?: string;
  inviter?: string;
  property?: string;
  access?: string;
  acceptUrl?: string;
  /** Optional — when omitted, the "Decline" line is hidden. */
  declineUrl?: string;
};

export function ShareInviteEmail({
  t = en.emails,
  locale = "en",
  name,
  inviter = "Someone",
  property = "Your property",
  access,
  acceptUrl = "https://example.com/invite/accept",
  declineUrl,
}: ShareInviteEmailProps) {
  const i = t.invite;
  const greeting = name?.trim()
    ? interpolate(i.greeting, { name: name.trim() })
    : i.greetingNoName;
  return (
    <FacturaEmail
      locale={locale}
      preheader={interpolate(i.preheader, { inviter, property })}
      headerTag={t.headerInvitation}
      eyebrow={i.eyebrow}
      title={i.title}
      footerNote={i.footerNote}
      footerTagline={t.footerTagline}
      unsubscribeLabel={t.unsubscribe}
    >
      <Text style={styles.text}>{greeting}</Text>
      <Text style={{ ...styles.text, margin: "0 0 8px" }}>
        {interpolate(i.body, { inviter })}
      </Text>

      {/* Detail block */}
      <Section
        style={{
          marginTop: "24px",
          border: `1px solid ${C.line}`,
          backgroundColor: C.paper,
        }}
      >
        <DetailRow label={i.labelProperty} value={property} />
        <DetailRow label={i.labelSharedBy} value={inviter} />
        <DetailRow label={i.labelAccess} value={access ?? i.accessDefault} last />
      </Section>

      <Section style={{ padding: "24px 0 0" }}>
        <Button href={acceptUrl} style={styles.button}>
          {i.button}
        </Button>
      </Section>
      {declineUrl ? (
        <Text style={{ ...styles.voice, margin: "14px 0 0" }}>
          {i.declinePrompt}{" "}
          <Link href={declineUrl} style={styles.accentLink}>
            {i.decline}
          </Link>
        </Text>
      ) : null}
    </FacturaEmail>
  );
}

// Preview defaults for `email dev`.
ShareInviteEmail.PreviewProps = {
  name: "Marisol",
  inviter: "Tomás Rey",
  property: "Av. Córdoba 1247 · 4B",
  declineUrl: "https://example.com/invite/decline",
} satisfies ShareInviteEmailProps;

export default ShareInviteEmail;

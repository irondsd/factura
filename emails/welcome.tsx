/**
 * Email 1 — Registration / welcome.
 * Renders through the shared <FacturaEmail> shell; only the content swaps.
 */

import { Button, Section, Text } from "@react-email/components";
import * as React from "react";
import { type Dictionary, interpolate, type Locale } from "../src/i18n/config";
import en from "../src/i18n/dictionaries/en.json";
import { FacturaEmail, styles } from "./components/factura-email";

type Emails = Dictionary["emails"];

export type WelcomeEmailProps = {
  /** Resolved `emails` dictionary slice for the recipient's locale. */
  t?: Emails;
  locale?: Locale;
  name?: string;
  ledgerUrl?: string;
};

export function WelcomeEmail({
  t = en.emails,
  locale = "en",
  name,
  ledgerUrl = "https://example.com/ledger",
}: WelcomeEmailProps) {
  const w = t.welcome;
  const greeting = name?.trim()
    ? interpolate(w.greeting, { name: name.trim() })
    : w.greetingNoName;
  return (
    <FacturaEmail
      locale={locale}
      preheader={w.preheader}
      headerTag={t.headerAccount}
      eyebrow={w.eyebrow}
      title={w.title}
      footerNote={w.footerNote}
      footerTagline={t.footerTagline}
      unsubscribeLabel={t.unsubscribe}
    >
      <Text style={styles.text}>{greeting}</Text>
      <Text style={styles.text}>{w.body1}</Text>
      <Text style={{ ...styles.text, margin: "0 0 8px" }}>{w.body2}</Text>

      <Section style={{ padding: "16px 0 0" }}>
        <Button href={ledgerUrl} style={styles.button}>
          {w.button}
        </Button>
      </Section>
      <Text style={{ ...styles.voice, margin: "14px 0 0" }}>{w.voice}</Text>
    </FacturaEmail>
  );
}

// Preview defaults for `email dev`.
WelcomeEmail.PreviewProps = {
  name: "Marisol",
} satisfies WelcomeEmailProps;

export default WelcomeEmail;

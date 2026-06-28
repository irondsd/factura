/**
 * Email 0 — One-time password (email sign-in).
 * Renders through the shared <FacturaEmail> shell; only the content swaps.
 */

import { Section, Text } from "@react-email/components";
import * as React from "react";
import type { Dictionary, Locale } from "../src/i18n/config";
import en from "../src/i18n/dictionaries/en.json";
import { C, FacturaEmail, styles } from "./components/factura-email";

type Emails = Dictionary["emails"];

export type OtpEmailProps = {
  /** Resolved `emails` dictionary slice for the recipient's locale. */
  t?: Emails;
  locale?: Locale;
  code?: string;
};

export function OtpEmail({
  t = en.emails,
  locale = "en",
  code,
}: OtpEmailProps) {
  const o = t.otp;
  return (
    <FacturaEmail
      locale={locale}
      preheader={o.preheader}
      headerTag={t.headerAccount}
      eyebrow={o.eyebrow}
      title={o.title}
      footerNote={o.footerNote}
      footerTagline={t.footerTagline}
      unsubscribeLabel={t.unsubscribe}
    >
      <Text style={styles.text}>{o.greeting}</Text>
      <Text style={styles.text}>{o.intro}</Text>

      <Section
        style={{
          marginTop: "24px",
          border: `1px solid ${C.line}`,
          backgroundColor: C.paper,
          textAlign: "center",
        }}
      >
        <Text
          style={{
            ...styles.text,
            fontSize: 20,
            letterSpacing: 10,
            margin: "8px 24px",
          }}
        >
          {code}
        </Text>
      </Section>

      <Text style={{ ...styles.voice, marginTop: "24px" }}>{o.expires}</Text>
      <Text style={styles.voice}>{o.ignore}</Text>
    </FacturaEmail>
  );
}

// Preview defaults for `email dev`.
OtpEmail.PreviewProps = {
  code: "123456",
} satisfies OtpEmailProps;

export default OtpEmail;

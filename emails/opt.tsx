/**
 * Email 0 — One-time password (email sign-in).
 * Renders through the shared <FacturaEmail> shell; only the content swaps.
 */

import { Section, Text } from "@react-email/components";
import * as React from "react";
import { C, FacturaEmail, styles } from "./components/factura-email";

export type OtpEmailProps = {
  code?: string;
};

export function OtpEmail({ code }: OtpEmailProps) {
  return (
    <FacturaEmail
      preheader="Use this code to sign in to your account."
      headerTag="Account"
      eyebrow="One-time password"
      title="Welcome."
    >
      <Text style={styles.text}>Hi there!</Text>
      <Text style={styles.text}>
        Here&apos;s your Factura verification code:
      </Text>

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

      <Text style={{ ...styles.voice, marginTop: "24px" }}>
        This code expires in 10 minutes.
      </Text>
      <Text style={styles.voice}>
        If you didn&apos;t request this code, no action is needed.
      </Text>
    </FacturaEmail>
  );
}

// Preview defaults for `email dev`.
OtpEmail.PreviewProps = {
  code: "123456",
} satisfies OtpEmailProps;

export default OtpEmail;

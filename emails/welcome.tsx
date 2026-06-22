/**
 * Email 1 — Registration / welcome.
 * Renders through the shared <FacturaEmail> shell; only the content swaps.
 */

import { Button, Section, Text } from "@react-email/components";
import * as React from "react";
import { FacturaEmail, styles } from "./components/factura-email";

export type WelcomeEmailProps = {
  name?: string;
  ledgerUrl?: string;
};

export function WelcomeEmail({
  name = "there",
  ledgerUrl = "https://example.com/ledger",
}: WelcomeEmailProps) {
  return (
    <FacturaEmail
      preheader="Your ledger is ready — drop a bill anywhere to begin."
      headerTag="Account"
      eyebrow="Welcome"
      title="Welcome."
    >
      <Text style={styles.text}>Hi {name},</Text>
      <Text style={styles.text}>
        Your ledger is set up and waiting. Drop a utility-bill PDF anywhere on
        the dashboard — we&apos;ll read the fine print, pull the amount and
        period, and keep a running total per property.
      </Text>
      <Text style={{ ...styles.text, margin: "0 0 8px" }}>
        Original files never leave your machine. Only the extracted text is
        saved.
      </Text>

      <Section style={{ padding: "16px 0 0" }}>
        <Button href={ledgerUrl} style={styles.button}>
          Open your ledger ›
        </Button>
      </Section>
      <Text style={{ ...styles.voice, margin: "14px 0 0" }}>
        Parsed locally · saved to your ledger.
      </Text>
    </FacturaEmail>
  );
}

// Preview defaults for `email dev`.
WelcomeEmail.PreviewProps = {
  name: "Marisol",
} satisfies WelcomeEmailProps;

export default WelcomeEmail;

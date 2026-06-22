/**
 * Email 2 — Shared property / accept invite.
 * Same shell as the welcome email — adds a ledger-style detail block and a
 * secondary "decline" line.
 */

import { Button, Link, Section, Text } from "@react-email/components";
import * as React from "react";
import { C, DetailRow, FacturaEmail, styles } from "./components/factura-email";

export type ShareInviteEmailProps = {
  name?: string;
  inviter?: string;
  property?: string;
  access?: string;
  acceptUrl?: string;
  /** Optional — when omitted, the "Decline" line is hidden. */
  declineUrl?: string;
};

export function ShareInviteEmail({
  name = "there",
  inviter = "Someone",
  property = "Your property",
  access = "Can view & add bills",
  acceptUrl = "https://example.com/invite/accept",
  declineUrl,
}: ShareInviteEmailProps) {
  return (
    <FacturaEmail
      preheader={`${inviter} shared ${property} with you.`}
      headerTag="Invitation"
      eyebrow="Shared property"
      title="You've been added."
      footerNote="You're receiving this because someone shared a property with your Factura account."
    >
      <Text style={styles.text}>Hi {name},</Text>
      <Text style={{ ...styles.text, margin: "0 0 8px" }}>
        {inviter} has shared a property with you. Accept to start seeing its
        bills, totals and history in your own ledger.
      </Text>

      {/* Detail block */}
      <Section
        style={{
          marginTop: "24px",
          border: `1px solid ${C.line}`,
          backgroundColor: C.paper,
        }}
      >
        <DetailRow label="Property" value={property} />
        <DetailRow label="Shared by" value={inviter} />
        <DetailRow label="Access" value={access} last />
      </Section>

      <Section style={{ padding: "24px 0 0" }}>
        <Button href={acceptUrl} style={styles.button}>
          Accept invitation
        </Button>
      </Section>
      {declineUrl ? (
        <Text style={{ ...styles.voice, margin: "14px 0 0" }}>
          Didn&apos;t expect this?{" "}
          <Link href={declineUrl} style={styles.accentLink}>
            Decline
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
  access: "Can view & add bills",
  declineUrl: "https://example.com/invite/decline",
} satisfies ShareInviteEmailProps;

export default ShareInviteEmail;

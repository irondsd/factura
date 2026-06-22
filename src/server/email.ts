/**
 * Transactional email — Resend + the react-email templates in /emails.
 *
 * Every send is best-effort: if `RESEND_API_KEY` is unset (local dev, CI) the
 * helpers no-op, and any send error is caught and logged rather than thrown.
 * Email must never block sign-in or fail an invite mutation — the invite is
 * valid regardless of whether its notification went out.
 *
 * Configure (in .env.local):
 *   RESEND_API_KEY   — Resend API key (https://resend.com/api-keys)
 *   EMAIL_FROM       — verified sender, e.g. "Factura <hello@yourdomain.com>"
 *   AUTH_URL         — app base URL, reused for links (falls back to :4000)
 */

import type { ReactElement } from "react";
import { Resend } from "resend";
import { OtpEmail } from "../../emails/opt";
import { ShareInviteEmail } from "../../emails/share-invite";
import { WelcomeEmail } from "../../emails/welcome";

const FROM = process.env.EMAIL_FROM ?? "Factura <onboarding@resend.dev>";

/** Absolute base URL for links inside emails. */
function baseUrl(): string {
  return (
    process.env.AUTH_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    "http://localhost:4000"
  ).replace(/\/$/, "");
}

let client: Resend | null = null;
function resend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  client ??= new Resend(key);
  return client;
}

/** Send via Resend, swallowing/​logging any failure. Returns whether it sent. */
async function send(opts: {
  to: string;
  subject: string;
  react: ReactElement;
}): Promise<boolean> {
  const r = resend();
  if (!r) {
    console.warn(`[email] RESEND_API_KEY unset — skipped "${opts.subject}"`);
    return false;
  }
  try {
    const { error } = await r.emails.send({ from: FROM, ...opts });
    if (error) {
      console.error(`[email] send failed "${opts.subject}":`, error);
      return false;
    }
    return true;
  } catch (err) {
    console.error(`[email] send threw "${opts.subject}":`, err);
    return false;
  }
}

/** Registration / welcome — fired on first sign-in (auth createUser event). */
export function sendWelcomeEmail(opts: { to: string; name?: string | null }) {
  return send({
    to: opts.to,
    subject: "Welcome to Factura",
    react: WelcomeEmail({
      name: opts.name?.trim() || "there",
      ledgerUrl: `${baseUrl()}/`,
    }),
  });
}

/** One-time sign-in code. Unlike the other helpers this one is *not*
 * best-effort: the email IS the sign-in, so a failed send must surface as an
 * error rather than silently stranding the user. In local dev / CI (no
 * RESEND_API_KEY) we log the code to the server console so sign-in still works
 * without a mail provider. */
export async function sendOtpEmail(opts: { to: string; code: string }) {
  if (!process.env.RESEND_API_KEY) {
    console.warn(`[email] RESEND_API_KEY unset — OTP for ${opts.to}: ${opts.code}`);
    return;
  }
  const sent = await send({
    to: opts.to,
    subject: "Your Factura sign-in code",
    react: OtpEmail({ code: opts.code }),
  });
  if (!sent) throw new Error("Failed to send sign-in code");
}

/** Shared-property invite — fired when an owner invites someone by email.
 * Accept links to the Properties page, where the invitee (signed in with the
 * invited Google address) explicitly accepts or declines the share. */
export function sendShareInviteEmail(opts: {
  to: string;
  inviter: string;
  property: string;
}) {
  return send({
    to: opts.to,
    subject: `${opts.inviter} shared a property with you on Factura`,
    react: ShareInviteEmail({
      inviter: opts.inviter,
      property: opts.property,
      acceptUrl: `${baseUrl()}/properties`,
      declineUrl: `${baseUrl()}/properties`,
    }),
  });
}

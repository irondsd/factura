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

import { eq } from "drizzle-orm";
import type { ReactElement } from "react";
import { Resend } from "resend";
import { db } from "@/db";
import { users } from "@/db/schema";
import { defaultLocale, interpolate, type Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { OtpEmail } from "../../emails/opt";
import { ShareInviteEmail } from "../../emails/share-invite";
import { WelcomeEmail } from "../../emails/welcome";

const FROM = process.env.EMAIL_FROM ?? "Factura <onboarding@resend.dev>";

/** Best-effort: the recipient's stored locale (emails can't read the cookie),
 * falling back to the default when they have no account yet. */
async function localeFor(email: string): Promise<Locale> {
  try {
    const row = await db.query.users.findFirst({
      where: eq(users.email, email),
      columns: { locale: true },
    });
    return row?.locale ?? defaultLocale;
  } catch {
    return defaultLocale;
  }
}

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
export async function sendWelcomeEmail(opts: {
  to: string;
  name?: string | null;
}) {
  const locale = await localeFor(opts.to);
  const t = (await getDictionary(locale)).emails;
  return send({
    to: opts.to,
    subject: t.welcome.subject,
    react: WelcomeEmail({
      t,
      locale,
      name: opts.name?.trim() || undefined,
      ledgerUrl: `${baseUrl()}/app`,
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
    console.warn(
      `[email] RESEND_API_KEY unset — OTP for ${opts.to}: ${opts.code}`,
    );
    return;
  }
  const locale = await localeFor(opts.to);
  const t = (await getDictionary(locale)).emails;
  const sent = await send({
    to: opts.to,
    subject: t.otp.subject,
    react: OtpEmail({ t, locale, code: opts.code }),
  });
  if (!sent) throw new Error("Failed to send sign-in code");
}

/** Shared-property invite — fired when an owner invites someone by email.
 * Accept links to the Properties page, where the invitee (signed in with the
 * invited Google address) explicitly accepts or declines the share. */
export async function sendShareInviteEmail(opts: {
  to: string;
  inviter: string;
  property: string;
}) {
  const locale = await localeFor(opts.to);
  const t = (await getDictionary(locale)).emails;
  return send({
    to: opts.to,
    subject: interpolate(t.invite.subject, { inviter: opts.inviter }),
    react: ShareInviteEmail({
      t,
      locale,
      inviter: opts.inviter,
      property: opts.property,
      acceptUrl: `${baseUrl()}/app/properties`,
      declineUrl: `${baseUrl()}/app/properties`,
    }),
  });
}

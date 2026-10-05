/**
 * Transactional email — Resend + the react-email templates in /emails.
 *
 * Welcome sends are best-effort. OTP delivery is the sign-in mechanism itself,
 * so its failure surfaces to Auth.js instead of silently stranding the user.
 *
 * Configure (in .env.local):
 *   RESEND_API_KEY   — Resend API key (https://resend.com/api-keys)
 *   EMAIL_FROM       — verified sender, e.g. "Factura <hello@yourdomain.com>"
 *   NEXT_PUBLIC_APP_URL — product app origin used by welcome-email links
 */

import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import type { ReactElement } from "react";
import { Resend } from "resend";
import { db } from "@/db";
import { users } from "@/db/schema";
import {
  defaultLocale,
  isLocale,
  LOCALE_COOKIE,
  type Locale,
} from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { OtpEmail } from "../../emails/opt";
import { WelcomeEmail } from "../../emails/welcome";

export class CampaignDeliveryError extends Error {}

/** Manual campaigns fail visibly. Each entry has one recipient, so addresses
 * are never disclosed to the other people in the campaign. Resend's strict
 * batch validation rejects the entire batch if any entry is invalid. */
export async function sendCampaignEmails(
  messages: { to: string; subject: string; html: string }[],
  idempotencyKey: string,
): Promise<string[]> {
  const r = resend();
  if (!r)
    throw new CampaignDeliveryError(
      "Resend no está configurado. No se envió ningún correo.",
    );
  try {
    const { data, error } = await r.batch.send(
      messages.map((message) => ({ from: FROM, ...message })),
      { idempotencyKey, batchValidation: "strict" },
    );
    if (error) {
      console.error("[campaign] Resend rejected batch:", error);
      throw new CampaignDeliveryError(
        "Resend rechazó el envío. Revisa la configuración y vuelve a intentarlo.",
      );
    }
    if (!data || data.data.length !== messages.length) {
      throw new CampaignDeliveryError(
        "No se pudo confirmar el envío completo. Puedes reintentar el mismo envío sin duplicarlo.",
      );
    }
    return data.data.map((email) => email.id);
  } catch (error) {
    if (error instanceof CampaignDeliveryError) throw error;
    console.error("[campaign] Resend request failed:", error);
    throw new CampaignDeliveryError(
      "No se pudo confirmar el envío. Puedes reintentar el mismo envío sin duplicarlo.",
    );
  }
}

const FROM = process.env.EMAIL_FROM ?? "Factura <onboarding@resend.dev>";

/** The recipient's saved preference, or `null` when they have no account yet.
 * This is the authoritative source for anyone who has signed in before; the
 * proxy keeps it in sync with the version they last browsed. */
async function storedLocale(email: string): Promise<Locale | null> {
  try {
    const row = await db.query.users.findFirst({
      where: eq(users.email, email),
      columns: { locale: true },
    });
    return row?.locale ?? null;
  } catch {
    return null;
  }
}

/** The locale of the current OTP request's visitor, from `NEXT_LOCALE`. */
async function cookieLocale(): Promise<Locale | null> {
  try {
    const value = (await cookies()).get(LOCALE_COOKIE)?.value;
    return isLocale(value) ? value : null;
  } catch {
    return null;
  }
}

/** Product origin for links inside identity emails. */
function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:4001").replace(
    /\/$/,
    "",
  );
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
  const locale = (await storedLocale(opts.to)) ?? defaultLocale;
  const t = (await getDictionary(locale)).emails;
  return send({
    to: opts.to,
    subject: t.welcome.subject,
    react: WelcomeEmail({
      t,
      locale,
      name: opts.name?.trim() || undefined,
      ledgerUrl: `${appUrl()}/`,
    }),
  });
}

/** One-time sign-in code. Unlike the other helpers this one is *not*
 * best-effort: the email IS the sign-in, so a failed send must surface as an
 * error rather than silently stranding the user. In local dev / CI (no
 * RESEND_API_KEY) we log the code to the server console so sign-in still works
 * without a mail provider. */
export async function sendOtpEmail(opts: { to: string; code: string }) {
  // Printing a live sign-in code is a development affordance and nothing else —
  // it's what lets an agent sign itself in (see AGENTS.md). Gate it on the
  // build, not just the missing key: a production deploy that lost its key must
  // fall through and throw below rather than quietly writing credentials into a
  // log aggregator.
  if (!process.env.RESEND_API_KEY && process.env.NODE_ENV !== "production") {
    console.warn(
      `[email] RESEND_API_KEY unset — OTP for ${opts.to}: ${opts.code}`,
    );
    return;
  }
  // OTP recipient == the person signing in, so their request cookie is a valid
  // signal. Prefer a saved preference (returning user), then the version they're
  // signing up from (new user, no row yet), then the default.
  const locale =
    (await storedLocale(opts.to)) ?? (await cookieLocale()) ?? defaultLocale;
  const t = (await getDictionary(locale)).emails;
  const sent = await send({
    to: opts.to,
    subject: t.otp.subject,
    react: OtpEmail({ t, locale, code: opts.code }),
  });
  if (!sent) throw new Error("Failed to send sign-in code");
}

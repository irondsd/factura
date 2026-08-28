/**
 * Telegram delivery for the public contact form and identity sign-in notices.
 *
 * Mail on @factura.uno is forwarded to a real inbox, so the addressed channels
 * on /contacto need nothing from us. The form is the one thing that had no
 * destination: it goes to a Telegram channel, which is where a message from a
 * stranger is actually noticed.
 *
 * Configure (in .env.local / the host's env):
 *   TELEGRAM_BOT_TOKEN   — from @BotFather
 *   TELEGRAM_CHANNEL_ID  — the target chat/channel (e.g. -1001234567890)
 *
 * With either unset the helpers no-op and log, the same bargain `sendOtpEmail`
 * makes without RESEND_API_KEY: local dev and CI keep working, and the message
 * is still visible in the server console.
 */

import type { Locale } from "@/i18n/config";
import { parseUserAgent } from "@/lib/userAgent";

/** Telegram rejects a `sendMessage` longer than this. */
const MESSAGE_LIMIT = 4096;

/** Room kept free for the header lines and the truncation marker, so a
 * maximum-length message body can never push the whole thing over the limit. */
const BODY_BUDGET = 3400;

export type ContactMessage = {
  topic: string;
  name: string | null;
  email: string;
  message: string;
  /** Which language the visitor was reading, so the reply can match. */
  locale?: Locale | null;
};

/** Escape a string for MarkdownV2.
 *
 * Telegram's list is longer than it looks: every one of these is reserved
 * ANYWHERE in the text, not just where it would open an entity, and a single
 * unescaped `.` or `-` fails the whole request with "can't parse entities" —
 * which, for a form open to the internet, means an ordinary sentence would be
 * enough to lose a message. */
export function escapeMarkdownV2(text: string): string {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, (c) => `\\${c}`);
}

/** Escape for the inside of a code span, where only the fence and the escape
 * character itself are special. Kept separate because running the full escaper
 * here would print the backslashes literally. */
function escapeCode(text: string): string {
  return text.replace(/[`\\]/g, (c) => `\\${c}`);
}

/** Clip escaped text to `max` characters without splitting an escape pair.
 * A trailing lone `\` would leave the next character unescaped-but-consumed and
 * fail parsing, so it comes off with the rest. The ellipsis is counted: `max` is
 * a hard API ceiling, and a result one character over it is a rejected send. */
function clipEscaped(text: string, max: number): string {
  if (text.length <= max) return text;
  let cut = text.slice(0, max - 1);
  // Count the run of backslashes at the cut: an odd run means the last one was
  // opening an escape whose character we just removed.
  const trailing = /\\+$/.exec(cut)?.[0].length ?? 0;
  if (trailing % 2 === 1) cut = cut.slice(0, -1);
  return `${cut}…`;
}

/** The channel post for one contact-form submission.
 *
 * Exported for the tests: the escaping and the length ceiling are the two
 * things that break a send, and both are decided here rather than at the fetch. */
export function buildContactMessage(contact: ContactMessage): string {
  const lines = [
    "📬 *Contact form*",
    "",
    `*Topic:* ${escapeMarkdownV2(contact.topic)}`,
  ];
  if (contact.name) lines.push(`*Name:* ${escapeMarkdownV2(contact.name)}`);
  // The address goes in a code span: Telegram makes those tap-to-copy, which is
  // the one interaction this post exists for.
  lines.push(`*Email:* \`${escapeCode(contact.email)}\``);
  if (contact.locale) lines.push(`*Language:* ${contact.locale}`);
  lines.push("", clipEscaped(escapeMarkdownV2(contact.message), BODY_BUDGET));

  return clipEscaped(lines.join("\n"), MESSAGE_LIMIT);
}

export type SignInNotice = {
  email: string | null;
  name: string | null;
  /** The Auth.js provider id that carried it — "google", or "resend" for our
   * email one-time code. */
  provider: string | null;
  /** First sign-in of an account that did not exist a moment ago, rather than
   * someone coming back. */
  isNewUser: boolean;
  city: string | null;
  country: string | null;
  userAgent: string | null;
  /** How many accounts exist now. Only counted for a sign-up — on a returning
   * sign-in the number hasn't moved, and it isn't worth a query. */
  userCount?: number | null;
};

/** What to call each provider in the post. The ids are Auth.js's; "resend" in
 * particular says nothing to a reader, since what the user did was type a code. */
const PROVIDER_LABELS: Record<string, string> = {
  google: "Google",
  resend: "Email code",
};

/** The channel post for one sign-in.
 *
 * Deliberately short: this is a heartbeat, not a record. Everything here is
 * already in the database, so the post carries only what makes it worth
 * glancing at: who, whether they're new, and roughly from where.
 *
 * No IP address on purpose. City and country say as much as this notice needs,
 * and a channel is a longer-lived, less controlled home for an address than the
 * session row it also lives in.
 */
export function buildSignInMessage(notice: SignInNotice): string {
  const lines = [
    notice.isNewUser ? "🎉 *New account*" : "👋 *Signed in*",
    "",
    // Code span: tap-to-copy, the same reason the contact form's address gets
    // one — this is the handle for looking the account up anywhere else.
    `*Email:* \`${escapeCode(notice.email ?? "unknown")}\``,
  ];
  if (notice.name) lines.push(`*Name:* ${escapeMarkdownV2(notice.name)}`);
  if (notice.provider)
    lines.push(
      `*Via:* ${escapeMarkdownV2(PROVIDER_LABELS[notice.provider] ?? notice.provider)}`,
    );

  // Absent in local dev (no edge in front to resolve it) and on any request the
  // CDN didn't geolocate, so it's a line that appears rather than one that
  // renders "unknown".
  const place = [notice.city, notice.country].filter(Boolean).join(", ");
  if (place) lines.push(`*From:* ${escapeMarkdownV2(place)}`);

  const { browser, os } = parseUserAgent(notice.userAgent);
  const device = [browser, os].filter(Boolean).join(" on ");
  if (device) lines.push(`*Device:* ${escapeMarkdownV2(device)}`);

  if (notice.userCount != null)
    lines.push(`*Accounts:* ${escapeMarkdownV2(String(notice.userCount))}`);

  return clipEscaped(lines.join("\n"), MESSAGE_LIMIT);
}

/** How much of the sign-in traffic reaches the channel. */
export type SignInNoticeMode = "all" | "new" | "off";

/** Read that setting out of the environment.
 *
 * `new` is the safe default: this is a registration notice, so returning
 * sign-ins should not reach the channel unless they are explicitly requested.
 * `all` is available as an opt-in while every sign-in is worth seeing, and
 * `off` silences the notice entirely.
 *
 * Anything unrecognized also reads as `new` — a typo must not accidentally
 * turn returning sign-ins back on.
 */
export function signInNoticeMode(): SignInNoticeMode {
  const raw = process.env.TELEGRAM_NOTIFY_SIGNINS?.trim().toLowerCase();
  if (!raw) return "new";
  if (["off", "false", "0", "none", "no"].includes(raw)) return "off";
  if (["new", "signups", "new-users"].includes(raw)) return "new";
  if (raw === "all") return "all";
  return "new";
}

/** Whether this particular sign-in is one the channel wants. Checked before
 * anything is gathered, so a switched-off notice costs a string compare. */
export function shouldNotifySignIn(isNewUser: boolean): boolean {
  const mode = signInNoticeMode();
  return mode === "all" || (mode === "new" && isNewUser);
}

function config(): { token: string; chatId: string } | null {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHANNEL_ID;
  return token && chatId ? { token, chatId } : null;
}

/** Post to the channel. Returns whether the message reached Telegram.
 *
 * `skipped` is success, not failure: an unconfigured environment (local dev,
 * CI) has nowhere to send, and the caller shouldn't answer a visitor with an
 * error because of it — the console line below is the local destination.
 */
export async function sendTelegramMessage(
  text: string,
): Promise<{ ok: boolean; skipped: boolean }> {
  const cfg = config();
  if (!cfg) {
    console.warn(
      `[telegram] TELEGRAM_BOT_TOKEN/TELEGRAM_CHANNEL_ID unset — message not sent:\n${text}`,
    );
    return { ok: true, skipped: true };
  }

  const post = (body: Record<string, unknown>) =>
    fetch(`https://api.telegram.org/bot${cfg.token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: cfg.chatId, ...body }),
    });

  try {
    const res = await post({ text, parse_mode: "MarkdownV2" });
    if (res.ok) return { ok: true, skipped: false };

    const detail = await res.text().catch(() => "");
    console.error(`[telegram] sendMessage failed (${res.status}): ${detail}`);

    // A 400 is almost always entity parsing — an escape this module got wrong
    // on some character a visitor typed. The formatting is worth losing; the
    // message isn't, so retry it as plain text.
    if (res.status === 400) {
      const plain = await post({ text });
      if (plain.ok) {
        console.warn("[telegram] delivered without formatting after a 400");
        return { ok: true, skipped: false };
      }
      console.error(
        `[telegram] plain-text retry failed (${plain.status}): ${await plain
          .text()
          .catch(() => "")}`,
      );
    }
    return { ok: false, skipped: false };
  } catch (err) {
    console.error("[telegram] sendMessage threw:", err);
    return { ok: false, skipped: false };
  }
}

/** One contact-form submission, formatted and posted. */
export async function sendContactMessage(
  contact: ContactMessage,
): Promise<{ ok: boolean; skipped: boolean }> {
  return sendTelegramMessage(buildContactMessage(contact));
}

/** One sign-in, formatted and posted. */
export async function sendSignInMessage(
  notice: SignInNotice,
): Promise<{ ok: boolean; skipped: boolean }> {
  return sendTelegramMessage(buildSignInMessage(notice));
}

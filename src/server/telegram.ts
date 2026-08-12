/**
 * Telegram delivery — the destination for the public contact form.
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
 * fail parsing, so it comes off with the rest. */
function clipEscaped(text: string, max: number): string {
  if (text.length <= max) return text;
  let cut = text.slice(0, max);
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

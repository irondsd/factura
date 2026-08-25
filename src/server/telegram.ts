/**
 * Telegram delivery — the destination for the public contact form and for the
 * bills /probar could not read.
 *
 * Mail on @factura.uno is forwarded to a real inbox, so the addressed channels
 * on /contacto need nothing from us. The form is the one thing that had no
 * destination: it goes to a Telegram channel, which is where a message from a
 * stranger is actually noticed. An unrecognized bill is the same shape of
 * problem — something a stranger sent that only matters if we see it today.
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

/** …and a `sendDocument` caption at a quarter of it. An unrecognized-bill
 * notice is written once and sent either way — attached to the PDF or on its
 * own when there's no file — so the whole thing is budgeted to the smaller
 * ceiling rather than built twice. */
const CAPTION_LIMIT = 1024;

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

/** Escape for the `(...)` half of an inline link, where Telegram reserves only
 * `)` and `\`. Running the full escaper over a presigned URL would put
 * backslashes inside the signature and break the download. */
function escapeUrl(url: string): string {
  return url.replace(/[)\\]/g, (c) => `\\${c}`);
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

export type UnrecognizedBill = {
  submissionId: string;
  fileName: string;
  fileBytes: number;
  pageCount: number | null;
  /** Which language the visitor was reading — a rough proxy for where the bill
   * is from, and the language any reply would be written in. */
  locale?: Locale | null;
  /** "Who is this bill from?", if the visitor answered before we posted. Usually
   * null: the field only appears once the cascade has failed, which is the
   * moment this notice is sent. */
  vendorGuess: string | null;
  /** First slice of the extracted text — enough to tell at a glance which vendor
   * this is, without opening the PDF. */
  textPreview: string;
  /** Signed link to the stored original, for when the file itself couldn't be
   * attached. Null when there is nothing to link to. */
  downloadUrl?: string | null;
};

/** Human-sized file size. One decimal on MB, none on KB — this is a glanceable
 * line in a chat, not a report. */
function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** The channel post for a bill no parser recognized.
 *
 * This is the queue of parsers to write next, so the post is built to answer
 * one question — "what is this bill and can I get at it?" — inside a caption's
 * 1024 characters, since it usually rides along with the PDF itself. */
export function buildUnrecognizedBillMessage(bill: UnrecognizedBill): string {
  const size = formatBytes(bill.fileBytes);
  const pages =
    bill.pageCount === null
      ? ""
      : `, ${bill.pageCount} ${bill.pageCount === 1 ? "page" : "pages"}`;

  const lines = [
    "🧾 *Unrecognized bill*",
    "",
    // The name is a visitor's, so it goes in a code span rather than through the
    // full escaper — and code spans are tap-to-copy, which helps when the file
    // is sitting in a folder next to a dozen others.
    `*File:* \`${escapeCode(bill.fileName)}\` — ${escapeMarkdownV2(`${size}${pages}`)}`,
  ];
  if (bill.vendorGuess)
    lines.push(`*Says it's from:* ${escapeMarkdownV2(bill.vendorGuess)}`);
  if (bill.locale) lines.push(`*Language:* ${bill.locale}`);
  lines.push(`*Submission:* \`${escapeCode(bill.submissionId)}\``);
  if (bill.downloadUrl)
    lines.push(`*Download:* [stored PDF](${escapeUrl(bill.downloadUrl)})`);

  const header = lines.join("\n");
  // Whatever the header didn't use goes to the text, minus the blank line
  // between them and a little room for the ellipsis.
  const budget = CAPTION_LIMIT - header.length - 8;
  const preview =
    budget > 40
      ? clipEscaped(escapeMarkdownV2(bill.textPreview.trim()), budget)
      : "";

  return clipEscaped(
    preview ? `${header}\n\n${preview}` : header,
    CAPTION_LIMIT,
  );
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
 * already in the database — `/app/sessions` is the place that answers questions
 * about a session — so the post carries only what makes it worth glancing at:
 * who, whether they're new, and roughly from where.
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

/** Whether a channel is configured at all. Lets a caller skip the work of
 * gathering an attachment it has nowhere to send. */
export function isTelegramConfigured(): boolean {
  return config() !== null;
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

/** Post a file to the channel, with `caption` as its message.
 *
 * Same bargain as `sendTelegramMessage` — unconfigured is `skipped`, not a
 * failure — except that a caller with no channel has nothing to attach to, so
 * `isTelegramConfigured` is worth checking before reading a file off storage
 * just to hand it back here.
 */
export async function sendTelegramDocument(
  file: { bytes: Uint8Array; fileName: string },
  caption: string,
): Promise<{ ok: boolean; skipped: boolean }> {
  const cfg = config();
  if (!cfg) {
    console.warn(
      `[telegram] TELEGRAM_BOT_TOKEN/TELEGRAM_CHANNEL_ID unset — ${file.fileName} not sent:\n${caption}`,
    );
    return { ok: true, skipped: true };
  }

  const post = (extra?: Record<string, string>) => {
    const body = new FormData();
    body.set("chat_id", cfg.chatId);
    body.set("caption", caption);
    for (const [key, value] of Object.entries(extra ?? {}))
      body.set(key, value);
    // A fresh FormData per attempt: the retry below re-sends the same bytes and
    // a consumed multipart body cannot be replayed.
    body.set(
      "document",
      // The cast is the `Uint8Array<ArrayBufferLike>` every byte reader in this
      // codebase hands back meeting a `BlobPart` that insists on the
      // ArrayBuffer-backed variant. Same bytes — the distinction exists only to
      // keep SharedArrayBuffer out of DOM APIs.
      new Blob([file.bytes as Uint8Array<ArrayBuffer>], {
        type: "application/pdf",
      }),
      file.fileName,
    );
    return fetch(`https://api.telegram.org/bot${cfg.token}/sendDocument`, {
      method: "POST",
      body,
    });
  };

  try {
    const res = await post({ parse_mode: "MarkdownV2" });
    if (res.ok) return { ok: true, skipped: false };

    const detail = await res.text().catch(() => "");
    console.error(`[telegram] sendDocument failed (${res.status}): ${detail}`);

    // Same reasoning as the sendMessage path: a 400 is entity parsing, and the
    // bill is worth more than the bold labels on its caption.
    if (res.status === 400) {
      const plain = await post();
      if (plain.ok) {
        console.warn(
          "[telegram] document delivered without caption formatting",
        );
        return { ok: true, skipped: false };
      }
      console.error(
        `[telegram] plain-caption retry failed (${plain.status}): ${await plain
          .text()
          .catch(() => "")}`,
      );
    }
    return { ok: false, skipped: false };
  } catch (err) {
    console.error("[telegram] sendDocument threw:", err);
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
